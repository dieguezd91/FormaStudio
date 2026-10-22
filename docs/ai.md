# AI (Gemini)

The AI features (requirement extraction, design proposals, natural-language edits) run in the local
service through `@forma/ai`. They are optional: without a key, or with the kill switch off, the rest
of the application works unchanged.

## Enable, disable, status

| Variable | Default | Effect |
| --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | – | API key from <https://aistudio.google.com/apikey>. Without it AI routes answer `503 aiUnavailable`. |
| `FORMA_AI_ENABLED` | `true` | `false` or `0` (also `off`, `no`) switches AI off **even if a key exists**: AI routes answer `503 aiDisabled` and nothing is sent to Google. |
| `FORMA_AI_MODEL` | `gemini-3.8-flash` | Text and structured-output model. |
| `FORMA_AI_VISION_MODEL` | `FORMA_AI_MODEL` | Model used when a request contains images. |

`GET /ai/status` (no project, no model call, no secrets):

```json
{ "enabled": true, "configured": false, "provider": "gemini",
  "model": "gemini-3.8-flash", "visionModel": "gemini-3.8-flash", "reason": "missingKey" }
```

`enabled` is the kill switch, `configured` means a key is present; AI is usable only when both are
true. `reason` is `disabled` (wins) or `missingKey` when it is not. `GET /projects/:id/ai/impact` is
deterministic and stays available in every state.

Only `services/local/src/main.ts` (and the smoke script) load `.env` / read the environment. Servers
built in tests receive an injected provider, so tests never see a real key and never reach the
network.

## Quotas and billing

- A key without billing uses the API **free tier**: a small per-day request quota per model (20
  requests/day for `gemini-3.8-flash` when this was checked on 2026-10-22). It is shared by every
  call, so a few failed attempts exhaust it.
- A **Google AI Pro / Google One subscription does not include API usage**. To raise the quota,
  enable billing for the project in Google AI Studio, or wait for the daily reset.
- The service never retries a quota error (it cannot help) and reports `retryAfterSeconds` when Google
  sends `RetryInfo` (`retryDelay`) or a `Retry-After` header.

## Errors

Provider failures are classified from `APICallError.statusCode`, `responseBody` and the abort
reason, then returned as `{ error: { code, message, details? } }` (Spanish messages).

| Provider signal | `code` | HTTP | Retried? | Notes |
| --- | --- | --- | --- | --- |
| 400 `INVALID_ARGUMENT` | `aiRequestRejected` | 502 | No | "Gemini rechazó el formato del pedido…"; `details.providerMessage` has Google's text. An application bug, not the key or the quota. |
| 400 "API key not valid" / `API_KEY_INVALID`, 401, 403 | `aiAuthFailed` | 502 | No | Key invalid or without access to the model. |
| 429 `RESOURCE_EXHAUSTED` | `aiQuotaExceeded` | 429 | No | `details.freeTier` (quota id contains `FreeTier`), `details.daily` (`PerDay`), `details.retryAfterSeconds`. The message mentions that Google AI Pro does not include API quota and that billing is enabled in AI Studio. |
| 503 `UNAVAILABLE`, "overloaded", "high demand" | `aiOverloaded` | 503 | **Once**, after a short backoff | "El modelo está saturado, probá en unos minutos"; `details.retryAfterSeconds` if sent. |
| 504 `DEADLINE_EXCEEDED`, our 120 s timeout | `aiTimeout` | 504 | No | |
| Anything else (network, 5xx) | `aiProviderError` | 502 | No | `details.reason` is truncated to 300 characters. |
| Answer fails validation twice | `aiInvalidOutput` | 502 | – | `issues` lists what failed; nothing is stored. |
| Kill switch off | `aiDisabled` | 503 | – | |
| No key | `aiUnavailable` | 503 | – | |

### Requests per call

The AI SDK's own retries are off (`maxRetries: 0`). Its default of 2 retries every error it marks
retryable (408, 409, 429 and any 5xx), so a quota or overload failure cost 3 HTTP requests per
attempt; a 400 was never retried by the SDK. Requests are now bounded by `generateValidated`: one
request per attempt, one extra attempt when the answer fails validation, and **one** shared retry
for a 503. A provider error never triggers the validation retry.

| Call | Worst case now | Before |
| --- | --- | --- |
| `POST /ai/requirements` | 3 | 6 |
| `POST /ai/edit` | 3 | 6 |
| `POST /ai/proposals` | 5 (3 + a regeneration of duplicates: 1 attempt + 1 overload retry) | 9 |
| Any call that fails with 400 / 401 / 403 / 429 / other 5xx | 1 | 1 for 400/401/403; 3 for 429 and 5xx |
| Any call that fails with 503 | 2 | 3 |

The overload retry is `AiProvider.providerRetry` (`{ overloadedRetries: 1, backoffMs: 1500 }` by
default; tests use `backoffMs: 0`).

## Privacy: what is sent

Only what the request names: the sources in `sourceIds`, or by default the project-scoped sources;
text up to 200 000 characters and images up to 5 MiB each (at most 8). PDFs without text are skipped.
Edits send the selected nodes (or the screen), the design tokens, the library catalog and the
summaries of any proposals named in the request. Nothing else leaves the machine, and document
content is never logged. Model output is always validated again with the design-core and library
schemas before anything is stored.

## Structured output: wire schemas

The schema **sent** to the model and the validation of its **answer** are separate things.

- **Wire schemas** (`packages/ai/src/wire/`): small Zod schemas that only use object, array, string,
  number, boolean, enum and optional properties. `wireSchema()` converts one with `z.toJSONSchema`,
  removes the `$schema` and `additionalProperties` that Zod always emits, and hands it to the AI SDK
  through `jsonSchema()` with a `validate` function.
- **Why `jsonSchema()` and not Zod directly:** the AI SDK's Zod path (`zod4Schema` in
  `@ai-sdk/provider-utils`) calls `addAdditionalPropertiesToJsonSchema` and uses draft-7, so it
  re-adds `additionalProperties: false` and `$schema` to every object, whatever the schema says.
  With `jsonSchema()` the object we build is what travels.
- **Mapping in one place:** `validate` parses the wire answer, maps it to the domain output
  (`requirementsWire`, `proposalsWire`, `editWire`) and then applies the strict domain schemas
  (`requirementsOutputSchema`, `proposalsOutputSchema`, `editOutputSchema`: lengths, counts, exact
  operation shapes). Any issue goes back to the model as a `path: message` line in the validation
  retry. Limits that are no longer in the schema are stated in field descriptions and the prompts.
- **Wire representations:** library `params` and token overrides are `[{ key, text | number | boolean
  | list }]` / `[{ name, value }]` lists (no `additionalProperties`); an edit operation is one flat
  object where `type` selects the fields that count (no deep `anyOf`); a node patch is a list of
  `{ section, key, text | number | boolean | token | remove }` (no recursive `z.json()`; nested
  keys use dots, e.g. `cellSize.width`); data source mock data is JSON text (`mockJson`).
- **Sizes:** requirements 0.8 KB, proposals 2.5 KB, edit 4.5 KB (the old edit schema was ~160 KB).

### `structuredOutputs` provider option

`@ai-sdk/google` 4.0.102 (`google-language-model.ts`) sends `responseMimeType: application/json` and,
unless `providerOptions.google.structuredOutputs === false`, `responseJsonSchema` =
`sanitizeResponseJsonSchema(schema)`, which only rewrites `const` into a one-value `enum`. With
`structuredOutputs: false` Google gets no schema at all (the SDK still validates the answer), which
removes the 400 risk but also the model-side enforcement. **Setting used: the default (`true`)**,
because the wire schemas are small and constraint-free; `false` is the documented escape hatch if a
live run ever rejects a wire schema again (it is not wired to an env variable).

### What Gemini structured output accepts (verified 2026-10-22)

Live checks against `gemini-3.8-flash` through the AI SDK, 2026-10-22. **Confirmed** = observed
against the API; **conservative** = avoided by the wire schemas and by `gemini-compat.test.ts`,
but not individually isolated.

| Rule | Status | Evidence / note |
| --- | --- | --- |
| A plain object with string properties is accepted (`z.object({ a: z.string() })`) | Confirmed | Live call succeeded. |
| A `$ref` loop made only of required fields is rejected | Confirmed | 400 "ref loops are only supported if they include optional or nullable property values, or a potentially-zero-length array items, but a ref loop of required fields was found" (recursive `z.json()` in `updateNode` props). |
| The first requirements/proposals schemas are rejected | Confirmed | 400 "Request contains an invalid argument." They used `$schema`, `additionalProperties: false`, `minLength`, `maxLength`, `maxItems` and `enum`. **Which of these is the culprit was not isolated.** |
| No `$schema` | Conservative | One of the keywords above; removed. |
| No `additionalProperties` (so no `z.record` / free-form maps) | Conservative | Same; maps become entry lists. |
| No `minLength` / `maxLength` / `minItems` / `maxItems` / `minimum` / `maximum` / `exclusive*` / `multipleOf` / `pattern` / `format` / `uniqueItems` / `minProperties` / `maxProperties` / `patternProperties` / `propertyNames` | Conservative | Limits are validated server-side and described in prose. `z.int()` is avoided too: it emits `minimum`/`maximum`. |
| No `const` | Conservative | The SDK rewrites it to `enum` for `responseJsonSchema`; wire schemas use `z.enum` and never `z.literal`. |
| No `oneOf`, `allOf`, `not`, `if`/`then`/`else` | Conservative | |
| No `anyOf` at all | Conservative | Unions (`z.union`, `.nullable()`, discriminated unions) are replaced by optional fields. |
| No `default` | Conservative | |
| Any `$ref` cycle is rejected | Conservative | Stricter than Gemini, which tolerates loops through optional properties or arrays; the wire schemas have no `$ref` at all. |
| Nesting depth ≤ 10 (leaves included; proposals reach 9) | Conservative | Guard against accidental growth, not a known Google limit. |
| Serialized schema ≤ 8 KB (largest today 4.5 KB) | Conservative | Guard against re-embedding the domain schemas. |
| Optional properties, `enum`, arrays of objects, `description` | Used | Part of the wire schemas; accepted as far as the checks above go, but **the new wire schemas have not been run against the live API yet** (free-tier quota exhausted). |

`packages/ai/src/gemini-compat.test.ts` enforces these rules on the wire schemas and on the schema
actually passed to the model, and proves the walker catches the shapes that failed live (strict
domain schemas, recursive `z.json()`).

### Pending live validation

Run `npm run ai:smoke -w @forma/local-service` once the key has quota (or billing). It makes at most
3 + 3 + 5 requests, stops at the first provider error, prints the classified code and
`retryAfterSeconds`, and reports the number of requests sent. If Google still answers 400, the
provider message is printed (`aiRequestRejected`) and the table above needs the new finding.

## Tests

AI tests use scripted AI SDK mock models (`@forma/ai/testing`: `mockModel`, `providerFailure`,
`toWireEdit`, `toWireProposals`); no key or network is needed and `.env` is never loaded.
