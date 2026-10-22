using System.Collections.Generic;
using NUnit.Framework;

namespace Forma.Studio.Editor.Tests
{
    public class FormaBindingTests
    {
        const string ItemsJson = @"[
          { ""id"": ""espada"", ""name"": ""Espada de hierro"", ""category"": ""Armas"", ""quantity"": 1, ""stack"": false, ""tags"": { ""tier"": 2 } },
          { ""id"": ""pocion"", ""name"": ""Poci\u00f3n \""vida\"""", ""category"": ""Consumibles"", ""quantity"": 5.0 },
          { ""id"": ""arco"", ""category"": ""Armas"", ""quantity"": 1, ""extra"": null }
        ]";

        static IReadOnlyList<FormaRecord> Items() => FormaMockParser.ParseRecords(ItemsJson);

        [Test]
        public void ParseRecords_ReadsTypedFields()
        {
            var items = Items();

            Assert.AreEqual(3, items.Count);
            Assert.AreEqual("espada", items[0].Id);
            Assert.AreEqual("Poción \"vida\"", items[1].GetString("name"));
            Assert.AreEqual(5, items[1].GetInt("quantity"));
            Assert.IsFalse(items[0].GetBool("stack", true));
            Assert.AreEqual(2, items[0].GetInt("tags.tier"), "nested fields are dot-joined");
            Assert.AreEqual(7, items[2].GetInt("missing", 7));
            Assert.IsNull(items[2].GetString("extra"));
            Assert.IsNotEmpty(items[0].Uid);
            Assert.AreNotEqual(items[0].Uid, items[1].Uid);
        }

        [Test]
        public void GetSpriteKey_ReadsTheIconField()
        {
            var record = new FormaRecord("r1", new Dictionary<string, object> { ["icon"] = "mock/icons/espada.png" });

            Assert.AreEqual("mock/icons/espada.png", record.GetSpriteKey());
            Assert.IsNull(new FormaRecord("r2", new Dictionary<string, object>()).GetSpriteKey());
        }

        [Test]
        public void ParseBundle_ReturnsTheMockOfEveryDataSource()
        {
            const string bundle = @"{ ""format"": ""forma.ugui-bundle/v1"", ""dataSources"": [
              { ""id"": ""inventory.items"", ""kind"": ""collection"", ""mock"": [ { ""id"": ""a"" }, { ""id"": ""b"" } ] },
              { ""id"": ""player"", ""kind"": ""object"", ""mock"": { ""gold"": 12 } },
              { ""id"": ""empty"", ""kind"": ""collection"" }
            ] }";

            var mocks = FormaMockParser.ParseBundle(bundle);

            Assert.AreEqual(2, mocks["inventory.items"].Count);
            Assert.AreEqual(12, mocks["player"][0].GetInt("gold"), "an object mock is a one-record source");
            Assert.IsFalse(mocks.ContainsKey("empty"));
        }

        [Test]
        public void ParseRecords_RejectsMalformedJson()
        {
            Assert.Throws<FormaJsonException>(() => FormaMockParser.ParseRecords("[ { \"id\": "));
        }

        [Test]
        public void Binding_ViewKeyIgnoresIndexAndField()
        {
            var a = new FormaBinding("inventory.items", "items", 3, new FormaFilter("category", "Armas")) { field = "icon" };
            var b = new FormaBinding("inventory.items", "items", -1, new FormaFilter("category", "Armas"));
            var c = new FormaBinding("inventory.items", "items", 3, new FormaFilter("category", "Armaduras"));

            Assert.AreEqual(b.ViewKey, a.ViewKey);
            Assert.AreEqual("inventory.items|items[category=Armas]", a.ViewKey);
            Assert.AreNotEqual(a.ViewKey, c.ViewKey);
        }

        [Test]
        public void Binding_MatchesAllFiltersComparingAsStrings()
        {
            var items = Items();
            var binding = new FormaBinding("inventory.items", "items", -1,
                new FormaFilter("category", "Armas"), new FormaFilter("quantity", "1"));

            Assert.IsTrue(binding.Matches(items[0]));
            Assert.IsFalse(binding.Matches(items[1]));
            Assert.IsTrue(new FormaBinding("x", "items").Matches(items[1]), "no filters match everything");
        }

        sealed class ListSource : IFormaDataSource
        {
            public string Id => "inventory.items";
            public event System.Action Changed { add { } remove { } }
            public List<FormaRecord> Rows = new List<FormaRecord>();
            public IReadOnlyList<FormaRecord> GetView(FormaBinding view) => Rows;
            public FormaRecord GetEquipped(string equipmentSlotId) => null;
        }

        [Test]
        public void Resolve_PicksTheIndexedRecordAndReadsTheField()
        {
            var source = new ListSource { Rows = new List<FormaRecord>(Items()) };
            var binding = new FormaBinding("inventory.items", "items", 1) { field = "name" };

            Assert.AreEqual("Poción \"vida\"", FormaBindingResolver.ResolveField(source, binding));
            Assert.AreSame(source.Rows[1], FormaBindingResolver.ResolveRecord(source, binding));
        }

        [Test]
        public void Resolve_OutOfRangeOrEmptySlot_IsNull()
        {
            var source = new ListSource { Rows = new List<FormaRecord> { null } };

            Assert.IsNull(FormaBindingResolver.ResolveRecord(source, new FormaBinding("x", "items", 0)));
            Assert.IsNull(FormaBindingResolver.ResolveRecord(source, new FormaBinding("x", "items", 9)));
            Assert.IsNull(FormaBindingResolver.ResolveField(source, new FormaBinding("x", "items", 9) { field = "name" }));
        }

        [Test]
        public void Resolve_WithoutIndex_ReadsTheFirstRecord()
        {
            var source = new ListSource { Rows = new List<FormaRecord>(Items()) };

            Assert.AreEqual("espada", FormaBindingResolver.ResolveField(source, new FormaBinding("x", "items") { field = "id" }));
        }

        [Test]
        public void SimulationView_AppliesFiltersWhenNoSlotAddressesTheView()
        {
            var sim = new FormaInventorySimulation(new List<FormaSimSlot>(),
                new Dictionary<string, List<FormaRecord>> { ["inventory.items"] = new List<FormaRecord>(Items()) });

            var armas = sim.GetView(new FormaBinding("inventory.items", "items", -1, new FormaFilter("category", "Armas")));
            var todo = sim.GetView(new FormaBinding("inventory.items", "items"));
            var ninguno = sim.GetView(new FormaBinding("nope", "items"));

            Assert.AreEqual(new[] { "espada", "arco" }, new[] { armas[0].Id, armas[1].Id });
            Assert.AreEqual(3, todo.Count);
            Assert.AreEqual(0, ninguno.Count);
        }
    }
}
