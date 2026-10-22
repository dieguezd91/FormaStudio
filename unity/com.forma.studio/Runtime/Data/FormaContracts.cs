using System;
using System.Collections.Generic;

namespace Forma.Studio
{
    /// <summary>
    /// What the game exposes to a Forma screen. Components only read through this interface and render
    /// whatever it returns after <see cref="Changed"/>; they never own business rules.
    /// </summary>
    public interface IFormaDataSource
    {
        /// <summary>
        /// The bundle data source id this serves. <see cref="FormaScreen"/> picks the source whose id matches a
        /// binding's <c>dataSourceId</c>; <see cref="FormaSimulatedInventorySource.WildcardId"/> serves any id, and
        /// a screen with a single source uses it for every binding.
        /// </summary>
        string Id { get; }

        /// <summary>Records of the view in slot order; null entries are empty slots. <c>view.index</c> and <c>view.field</c> are ignored.</summary>
        IReadOnlyList<FormaRecord> GetView(FormaBinding view);

        /// <summary>The record equipped at an equipment slot, addressed by the slot's design node id (<see cref="FormaId.nodeId"/>); null when empty.</summary>
        FormaRecord GetEquipped(string equipmentSlotId);

        /// <summary>Raised when the data changed; screens re-read everything they show.</summary>
        event Action Changed;
    }

    /// <summary>The game's decision point: the UI expresses an intent, this answers accept or reject.</summary>
    public interface IFormaIntentHandler
    {
        FormaIntentResult Handle(FormaIntent intent);
    }

    /// <summary>
    /// Optional. A data source or handler that can say, without applying anything, whether an intent
    /// would be accepted. Drag and drop uses it to tint drop targets; without it only the <c>accepts</c> tags are checked.
    /// </summary>
    public interface IFormaDropValidator
    {
        FormaIntentResult Validate(FormaIntent intent);
    }

    /// <summary>A component that re-reads its data when the screen refreshes.</summary>
    public interface IFormaRefreshable
    {
        void Refresh(FormaScreen screen);
    }

    /// <summary>Intent names the built-in simulation answers (same as <c>SIMULATED_INTENTS</c> in the TS runtime).</summary>
    public static class FormaIntentNames
    {
        public const string MoveItem = "inventory.moveItem";
        public const string EquipItem = "inventory.equipItem";
        public const string UseItem = "inventory.useItem";
        public const string DropItem = "inventory.dropItem";
        public const string SplitStack = "inventory.splitStack";
    }

    /// <summary>
    /// An intent: a name plus a payload. Keys (all design node ids for slots): moveItem/equipItem
    /// <c>itemId, fromSlot, toSlot, slotType?</c>; menu actions <c>actionId, slotId, itemId?</c>;
    /// splitStack <c>itemId, amount, slotId</c>.
    /// </summary>
    public sealed class FormaIntent
    {
        public FormaIntent(string name, IReadOnlyDictionary<string, object> payload = null)
        {
            Name = name;
            Payload = payload ?? new Dictionary<string, object>();
        }

        public string Name { get; }
        public IReadOnlyDictionary<string, object> Payload { get; }

        public static FormaIntent Create(string name, params (string key, object value)[] payload)
        {
            var map = new Dictionary<string, object>();
            foreach (var (key, value) in payload) map[key] = value;
            return new FormaIntent(name, map);
        }

        public override string ToString() => Name;
    }

    public sealed class FormaIntentResult
    {
        FormaIntentResult(bool accepted, string reason)
        {
            Accepted = accepted;
            Reason = reason;
        }

        public bool Accepted { get; }

        /// <summary>Why it was rejected (Spanish for the built-in simulation); null when accepted.</summary>
        public string Reason { get; }

        public static FormaIntentResult Accept() => new FormaIntentResult(true, null);
        public static FormaIntentResult Reject(string reason) => new FormaIntentResult(false, reason);

        public override string ToString() => Accepted ? "accepted" : "rejected: " + Reason;
    }

    public enum FormaDragRole
    {
        Source,
        Target,
        Both,
    }
}
