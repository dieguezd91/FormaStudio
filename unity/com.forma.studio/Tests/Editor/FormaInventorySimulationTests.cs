using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;

namespace Forma.Studio.Editor.Tests
{
    /// <summary>Mirrors packages/runtime/src/runtime.test.ts for the simulated game rules.</summary>
    public class FormaInventorySimulationTests
    {
        const string Ds = "inventory.items";

        static FormaFilter Cat(string value) => new FormaFilter("category", value);

        static FormaSimSlot Bag(string nodeId, string category, int index, int maxStack = 20) => new FormaSimSlot
        {
            NodeId = nodeId,
            DataSourceId = Ds,
            Root = "items",
            Filters = new[] { Cat(category) },
            Index = index,
            HasDragDrop = true,
            Role = FormaDragRole.Both,
            MaxStack = maxStack,
        };

        static FormaSimSlot Equip(string nodeId, string category, string slotType, params string[] accepts) => new FormaSimSlot
        {
            NodeId = nodeId,
            DataSourceId = Ds,
            Root = "items",
            Filters = new[] { Cat(category) },
            Index = 0,
            IsEquipment = true,
            EquipmentSlotType = slotType,
            HasDragDrop = true,
            Role = FormaDragRole.Target,
            Accepts = accepts,
        };

        static FormaRecord Item(string uid, string id, string category, string slotType, int quantity, int maxStack) =>
            new FormaRecord(uid, new Dictionary<string, object>
            {
                ["id"] = id,
                ["name"] = id.ToUpperInvariant(),
                ["category"] = category,
                ["slotType"] = slotType,
                ["quantity"] = (double)quantity,
                ["maxStack"] = (double)maxStack,
            });

        /// <summary>Consumibles c0..c3, Armas w0..w2, Armaduras a0..a2, equipment head + weapon.</summary>
        static FormaInventorySimulation Build(params FormaRecord[] extra)
        {
            var slots = new List<FormaSimSlot>
            {
                Equip("eq-head", "Armaduras", "head", "head"),
                Equip("eq-weapon", "Armas", "weapon"),
            };
            for (var i = 0; i < 4; i++) slots.Add(Bag("c" + i, "Consumibles", i));
            for (var i = 0; i < 3; i++) slots.Add(Bag("w" + i, "Armas", i, 1));
            for (var i = 0; i < 3; i++) slots.Add(Bag("a" + i, "Armaduras", i, 1));

            var records = new List<FormaRecord>
            {
                Item("x1", "espada", "Armas", "weapon", 1, 1),
                Item("x2", "arco", "Armas", "weapon", 1, 1),
                Item("x3", "yelmo", "Armaduras", "head", 1, 1),
                Item("x4", "peto", "Armaduras", "chest", 1, 1),
            };
            records.AddRange(extra);
            return new FormaInventorySimulation(slots, new Dictionary<string, List<FormaRecord>> { [Ds] = records });
        }

        static FormaRecord[] Potions(int a, int b) => new[]
        {
            Item("p1", "pocion", "Consumibles", "none", a, 20),
            Item("p2", "pocion", "Consumibles", "none", b, 20),
            Item("p3", "pan", "Consumibles", "none", 8, 20),
        };

        static FormaBinding View(string category) => new FormaBinding(Ds, "items", -1, Cat(category));

        static string[] Ids(FormaInventorySimulation sim, string category) =>
            sim.GetView(View(category)).Select(r => r?.Id).ToArray();

        static int Qty(FormaInventorySimulation sim, string category, int slot) =>
            sim.GetView(View(category))[slot].GetInt("quantity");

        static FormaIntent Move(string from, string to) => FormaIntent.Create(
            FormaIntentNames.MoveItem, ("itemId", "x"), ("fromSlot", from), ("toSlot", to));

        static FormaIntent Equipping(string from, string to) => FormaIntent.Create(
            FormaIntentNames.EquipItem, ("itemId", "x"), ("fromSlot", from), ("toSlot", to));

        static FormaIntent Slot(string name, string slot) => FormaIntent.Create(name, ("actionId", "a"), ("slotId", slot));

        [Test]
        public void Seed_PlacesRecordsPerViewAndClaimsEquipment()
        {
            var sim = Build(Potions(5, 18));

            Assert.AreEqual(new[] { "pocion", "pocion", "pan", null }, Ids(sim, "Consumibles"));
            Assert.AreEqual("yelmo", sim.GetEquipped("eq-head").Id);
            Assert.AreEqual("espada", sim.GetEquipped("eq-weapon").Id);
            Assert.AreEqual(new[] { "arco", null, null }, Ids(sim, "Armas"), "equipped records leave the bag");
            Assert.AreEqual(new[] { "peto", null, null }, Ids(sim, "Armaduras"));
        }

        [Test]
        public void Move_ToEmptySlot_PlacesItemThere()
        {
            var sim = Build(Potions(5, 18));

            var result = sim.Handle(Move("c2", "c3"));

            Assert.IsTrue(result.Accepted, result.Reason);
            Assert.AreEqual(new[] { "pocion", "pocion", null, "pan" }, Ids(sim, "Consumibles"));
        }

        [Test]
        public void Move_OntoDifferentItem_Swaps()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.Handle(Move("c0", "c2")).Accepted);

            Assert.AreEqual(new[] { "pan", "pocion", "pocion", null }, Ids(sim, "Consumibles"));
            Assert.AreEqual(5, Qty(sim, "Consumibles", 2));
        }

        [Test]
        public void Move_SameItem_MergesUpToMaxStackAndLeavesRemainder()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.Handle(Move("c0", "c1")).Accepted);

            Assert.AreEqual(3, Qty(sim, "Consumibles", 0));
            Assert.AreEqual(20, Qty(sim, "Consumibles", 1));
        }

        [Test]
        public void Move_SameItemThatFits_MergesCompletelyAndFreesSource()
        {
            var sim = Build(Potions(1, 5));

            Assert.IsTrue(sim.Handle(Move("c0", "c1")).Accepted);

            Assert.AreEqual(new[] { null, "pocion", "pan", null }, Ids(sim, "Consumibles"));
            Assert.AreEqual(6, Qty(sim, "Consumibles", 1));
        }

        [Test]
        public void Move_SameItemOntoFullStack_Swaps()
        {
            var sim = Build(Potions(5, 20));

            Assert.IsTrue(sim.Handle(Move("c0", "c1")).Accepted);

            Assert.AreEqual(20, Qty(sim, "Consumibles", 0));
            Assert.AreEqual(5, Qty(sim, "Consumibles", 1));
        }

        [Test]
        public void Move_OntoSameSlot_IsAcceptedAndChangesNothing()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.Handle(Move("c0", "c0")).Accepted);

            Assert.AreEqual(new[] { "pocion", "pocion", "pan", null }, Ids(sim, "Consumibles"));
        }

        [Test]
        public void Move_AcrossViews_IsRejected()
        {
            var sim = Build(Potions(5, 18));

            var result = sim.Handle(Move("c0", "w1"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("Las casillas pertenecen a listas distintas.", result.Reason);
            Assert.AreEqual(new[] { "pocion", "pocion", "pan", null }, Ids(sim, "Consumibles"));
        }

        [Test]
        public void Move_FromEmptySlot_IsRejected()
        {
            var result = Build(Potions(5, 18)).Handle(Move("c3", "c2"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("La casilla de origen está vacía.", result.Reason);
        }

        [Test]
        public void Move_ToSourceOnlyOrUnknownSlot_IsRejected()
        {
            var slots = new List<FormaSimSlot> { Bag("c0", "Consumibles", 0), Bag("c1", "Consumibles", 1) };
            slots[1].Role = FormaDragRole.Source;
            var sim = new FormaInventorySimulation(slots, new Dictionary<string, List<FormaRecord>>
            {
                [Ds] = new List<FormaRecord> { Item("p1", "pocion", "Consumibles", "none", 5, 20) },
            });

            Assert.AreEqual("Esa casilla no admite objetos.", sim.Handle(Move("c0", "c1")).Reason);
            Assert.AreEqual("Esa casilla no admite objetos.", sim.Handle(Move("c0", "nowhere")).Reason);
        }

        [Test]
        public void Move_ToSlotThatDoesNotAcceptTheItem_NamesTheItem()
        {
            var sim = Build(Potions(5, 18));
            // eq-head accepts only «head»; the potion is neither a head item nor tagged «item».
            var result = sim.Handle(Equipping("c0", "eq-head"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("Esa casilla no acepta «POCION».", result.Reason);
        }

        [Test]
        public void Equip_MatchingSlotType_ReturnsPreviousOccupantToOrigin()
        {
            var sim = Build();

            var result = sim.Handle(Equipping("w0", "eq-weapon"));

            Assert.IsTrue(result.Accepted, result.Reason);
            Assert.AreEqual("arco", sim.GetEquipped("eq-weapon").Id);
            Assert.AreEqual(new[] { "espada", null, null }, Ids(sim, "Armas"));
        }

        [Test]
        public void Equip_WrongSlotType_IsRejectedWithSlotTypeReason()
        {
            var sim = Build();

            var result = sim.Handle(Equipping("a0", "eq-weapon"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("Esa casilla solo acepta objetos de tipo «weapon».", result.Reason);
            Assert.AreEqual("espada", sim.GetEquipped("eq-weapon").Id);
        }

        [Test]
        public void Unequip_IsNotSupportedInTheSimulation()
        {
            var slots = new List<FormaSimSlot> { Bag("a0", "Armaduras", 0), Equip("eq-head", "Armaduras", "head") };
            var sim = new FormaInventorySimulation(slots, new Dictionary<string, List<FormaRecord>>
            {
                [Ds] = new List<FormaRecord> { Item("x", "x", "Armaduras", "head", 1, 1) },
            });
            // the lone armor is claimed by the paper doll at seed time
            Assert.IsNull(sim.GetView(View("Armaduras"))[0]);
            Assert.AreEqual("x", sim.GetEquipped("eq-head").Id);
            Assert.AreEqual("Desequipar no está soportado en la simulación.",
                sim.Handle(Move("eq-head", "a0")).Reason);
        }

        [Test]
        public void Use_DecrementsQuantity()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.Handle(Slot(FormaIntentNames.UseItem, "c0")).Accepted);

            Assert.AreEqual(4, Qty(sim, "Consumibles", 0));
        }

        [Test]
        public void Use_LastUnit_RemovesTheItem()
        {
            var sim = Build(Potions(1, 18));

            Assert.IsTrue(sim.Handle(Slot(FormaIntentNames.UseItem, "c0")).Accepted);

            Assert.AreEqual(new[] { null, "pocion", "pan", null }, Ids(sim, "Consumibles"));
        }

        [Test]
        public void Use_EmptySlot_IsRejected()
        {
            var result = Build(Potions(5, 18)).Handle(Slot(FormaIntentNames.UseItem, "c3"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("No hay ningún objeto que usar.", result.Reason);
        }

        [Test]
        public void Drop_RemovesTheItem()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.Handle(Slot(FormaIntentNames.DropItem, "c0")).Accepted);
            Assert.AreEqual(new[] { null, "pocion", "pan", null }, Ids(sim, "Consumibles"));
            Assert.AreEqual("No hay ningún objeto que soltar.", sim.Handle(Slot(FormaIntentNames.DropItem, "c0")).Reason);
        }

        static FormaIntent Split(string slot, object amount) => FormaIntent.Create(
            FormaIntentNames.SplitStack, ("itemId", "pocion"), ("amount", amount), ("slotId", slot));

        [Test]
        public void Split_MovesAmountIntoFirstEmptySlot()
        {
            var sim = Build(Potions(5, 18));

            var result = sim.Handle(Split("c0", 2));

            Assert.IsTrue(result.Accepted, result.Reason);
            Assert.AreEqual(new[] { "pocion", "pocion", "pan", "pocion" }, Ids(sim, "Consumibles"));
            Assert.AreEqual(3, Qty(sim, "Consumibles", 0));
            Assert.AreEqual(2, Qty(sim, "Consumibles", 3));
        }

        [Test]
        public void Split_WithoutFreeSlot_IsRejected()
        {
            var sim = Build(Potions(5, 18).Append(Item("p4", "mineral", "Consumibles", "none", 3, 20)).ToArray());

            var result = sim.Handle(Split("c0", 2));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("No hay casillas libres para la nueva pila.", result.Reason);
            Assert.AreEqual(5, Qty(sim, "Consumibles", 0));
        }

        [TestCase(0)]
        [TestCase(5)]
        [TestCase(-1)]
        [TestCase(1.5)]
        [TestCase("2")]
        public void Split_InvalidAmount_IsRejected(object amount)
        {
            var result = Build(Potions(5, 18)).Handle(Split("c0", amount));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("La cantidad a dividir no es válida.", result.Reason);
        }

        [Test]
        public void Split_EquippedStack_IsRejected()
        {
            var sim = Build();

            Assert.AreEqual("La cantidad a dividir no es válida.", sim.Handle(Split("eq-weapon", 1)).Reason,
                "a single equipped unit cannot be split");
        }

        [Test]
        public void UnknownIntent_HasNoHandler()
        {
            var result = Build().Handle(FormaIntent.Create("inventory.sort"));

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("Sin manejador: nadie atiende «inventory.sort».", result.Reason);
        }

        [Test]
        public void Reset_RestoresSeedStateAndDoesNotMutateTheMocks()
        {
            var potions = Potions(5, 18);
            var sim = Build(potions);
            sim.Handle(Move("c0", "c1"));
            sim.Handle(Slot(FormaIntentNames.UseItem, "c2"));

            sim.Reset();

            Assert.AreEqual(new[] { "pocion", "pocion", "pan", null }, Ids(sim, "Consumibles"));
            Assert.AreEqual(5, Qty(sim, "Consumibles", 0));
            Assert.AreEqual(5, potions[0].GetInt("quantity"));
        }

        [Test]
        public void CheckDrop_ReportsWithoutChangingState()
        {
            var sim = Build(Potions(5, 18));

            Assert.IsTrue(sim.CheckDrop("c0", "c3").Accepted);
            Assert.IsFalse(sim.CheckDrop("c0", "w0").Accepted);
            Assert.AreEqual(new[] { "pocion", "pocion", "pan", null }, Ids(sim, "Consumibles"));
        }
    }
}
