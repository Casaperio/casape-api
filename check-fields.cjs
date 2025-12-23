const { MongoClient } = require("mongodb");
const uri = "mongodb+srv://fillipe_db_user:OftpZuTwdqueiIJh@cluster-casape.mvnzlel.mongodb.net/?appName=Cluster-casape";
const client = new MongoClient(uri);
async function run() {
  await client.connect();
  const db = client.db("stays_api");
  
  // Pegar 1 booking para ver os campos
  const booking = await db.collection("stays_unified_bookings").findOne({});
  console.log("Campos disponíveis:");
  console.log(JSON.stringify(booking, null, 2));
  
  await client.close();
}
run().catch(console.error);
