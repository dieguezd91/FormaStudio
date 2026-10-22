import {
  validateDocument,
  type FormaDocument,
  type FormaScreen,
  type IssueCode,
  type Result,
  type ValidationIssue,
} from '@forma/design-core';
import type { CompatibilityReport } from '../report';
import type { ExportError, ExportMeta, ExportOutput, Exporter } from '../types';
import { BUNDLE_FORMAT, BUNDLE_VERSION, type UguiBundle } from './bundle';
import { buildCompatibilityReport, missingScreenReport } from './compatibility';
import { convertScreen } from './convert';

export interface UguiExporterOptions {
  /** Written to `meta.exporter`. */
  exporter?: string;
}

export const DEFAULT_EXPORTER_NAME = 'forma-studio/exporters-ugui@0.1.0';

export type UguiExporter = Exporter<UguiBundle>;

const ISSUE_MESSAGES: Record<IssueCode, (name: string) => string> = {
  rootMissing: () => 'La pantalla no tiene un nodo raíz válido.',
  rootHasParent: (n) => `El nodo raíz «${n}» no puede tener padre.`,
  idMismatch: (n) => `El nodo «${n}» está guardado bajo un id que no es el suyo.`,
  childMissing: (n) => `El nodo «${n}» lista un hijo que no existe.`,
  duplicateChild: (n) => `El nodo «${n}» lista el mismo hijo más de una vez.`,
  parentMissing: (n) => `El nodo «${n}» apunta a un padre que no existe.`,
  parentMismatch: (n) => `El padre del nodo «${n}» no coincide con el nodo que lo contiene.`,
  notListedByParent: (n) => `El nodo «${n}» no figura entre los hijos de su padre.`,
  cycle: (n) => `La jerarquía tiene un ciclo en torno al nodo «${n}».`,
  unreachable: (n) => `El nodo «${n}» no es alcanzable desde la raíz de la pantalla.`,
  duplicateId: () =>
    'El documento tiene ids repetidos (pantallas, fuentes de datos o intenciones).',
  duplicateBehavior: (n) => `El nodo «${n}» tiene un comportamiento repetido.`,
  duplicateBinding: (n) => `El nodo «${n}» tiene un vínculo de datos repetido.`,
  unresolvedReference: (n) =>
    `El nodo «${n}» referencia algo que no existe (intención, fuente de datos o contenido de pestaña).`,
  unknownToken: (n) => `El nodo «${n}» usa un token de estilo que no existe.`,
};

const fail = (code: ExportError['code'], reasons: string[]): Result<never, ExportError> => ({
  ok: false,
  error: { code, reasons },
});

function describeIssue(issue: ValidationIssue, screen: FormaScreen): string {
  const name = issue.nodeId ? (screen.nodes[issue.nodeId]?.name ?? issue.nodeId) : screen.name;
  return ISSUE_MESSAGES[issue.code](name);
}

/** `Menú / Principal` -> `Menu_Principal`; never empty. */
export function safeFileName(name: string): string {
  const safe = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || 'Screen';
}

function readme(fileName: string, screenName: string, report: CompatibilityReport): string {
  const connect = report.summary.youMustConnect;
  return [
    `Forma Studio: exportación de «${screenName}» para Unity uGUI`,
    '',
    'Próximos pasos',
    `1. Copiá ${fileName} dentro de tu proyecto Unity (por ejemplo en Assets/UI/Forma/).`,
    '2. Con el paquete com.forma.studio instalado, seleccioná el archivo e importalo con',
    '   Forma > Importar bundle uGUI. Se crea el Prefab con su jerarquía y componentes.',
    '3. Conectá tu juego (ver abajo) y arrastrá el Prefab a un Canvas de tu escena.',
    '4. Para actualizar el diseño, volvé a exportar e importar: Forma sólo toca las',
    '   propiedades que gestiona y respeta tus cambios en las demás.',
    '',
    'Qué tenés que conectar',
    ...(connect.length > 0
      ? connect.map((line) => `- ${line}`)
      : ['- Nada: todo está marcado como conectado o resuelto por la simulación.']),
    '',
    'Los datos de ejemplo del bundle son sólo para la vista previa; no los uses como datos del juego.',
    '',
  ].join('\n');
}

/** The pure, deterministic uGUI exporter (design doc §10); the Unity importer consumes its bundle. */
export function createUguiExporter(options: UguiExporterOptions = {}): UguiExporter {
  const exporterName = options.exporter ?? DEFAULT_EXPORTER_NAME;
  const findScreen = (doc: FormaDocument, screenId: string) =>
    doc.screens.find((s) => s.id === screenId);

  return {
    target: 'unity-ugui',

    analyze(doc, screenId) {
      const screen = findScreen(doc, screenId);
      if (!screen) return missingScreenReport(screenId);
      return buildCompatibilityReport(doc, screen, convertScreen(doc, screen));
    },

    export(doc, screenId, meta: ExportMeta): Result<ExportOutput<UguiBundle>, ExportError> {
      const screen = findScreen(doc, screenId);
      if (!screen) return fail('screenNotFound', [`La pantalla «${screenId}» no existe.`]);

      const issues = validateDocument(doc).filter(
        (issue) => issue.screenId === undefined || issue.screenId === screen.id,
      );
      if (issues.length > 0) {
        return fail(
          'invalidDocument',
          issues.map((issue) => describeIssue(issue, screen)),
        );
      }

      const converted = convertScreen(doc, screen);
      const names = new Set<string>();
      for (const intent of converted.intents) {
        if (names.has(intent.name)) {
          return fail('invalidDocument', [
            `Hay dos intenciones llamadas «${intent.name}»; los componentes las referencian por nombre.`,
          ]);
        }
        names.add(intent.name);
      }

      const { notes: _notes, ...parts } = converted;
      void _notes;
      const bundle: UguiBundle = {
        format: BUNDLE_FORMAT,
        meta: {
          bundleVersion: BUNDLE_VERSION,
          projectId: meta.projectId,
          projectName: meta.projectName,
          documentRevision: meta.documentRevision,
          screenId: screen.id,
          screenName: screen.name,
          exportedAt: meta.exportedAt,
          exporter: exporterName,
        },
        canvas: parts.canvas,
        theme: parts.theme,
        nodes: parts.nodes,
        dataSources: parts.dataSources,
        intents: parts.intents,
        managed: parts.managed,
      };

      const report = buildCompatibilityReport(doc, screen, converted);
      const bundleFile = `${safeFileName(screen.name)}.forma.json`;
      return {
        ok: true,
        value: {
          bundle,
          report,
          files: [
            { path: bundleFile, contents: `${JSON.stringify(bundle, null, 2)}\n` },
            { path: 'README-forma.txt', contents: readme(bundleFile, screen.name, report) },
          ],
        },
      };
    },
  };
}
