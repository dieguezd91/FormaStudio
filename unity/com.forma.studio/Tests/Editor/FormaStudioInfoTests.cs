using NUnit.Framework;

namespace Forma.Studio.Editor.Tests
{
    public class FormaStudioInfoTests
    {
        [Test]
        public void SchemaVersion_IsOne()
        {
            Assert.AreEqual(1, FormaStudioInfo.SchemaVersion);
        }
    }
}
