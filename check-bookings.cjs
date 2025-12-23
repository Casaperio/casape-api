const { MongoClient } = require("mongodb");
const uri = "mongodb+srv://fillipe_db_user:OftpZuTwdqueiIJh@cluster-casape.mvnzlel.mongodb.net/?appName=Cluster-casape";
const client = new MongoClient(uri);
async function run() {
  await client.connect();
  const db = client.db("stays_api");
  const bookings = await db.collection("stays_unified_bookings").find({}, { projection: { checkInDate: 1, totalAmount: 1 }}).toArray();
  const byMonth = {};
  bookings.forEach(b => {
    if (!b.checkInDate) return;
    const date = new Date(b.checkInDate);
    const key = date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0");
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
    byMonth[key].count++;
    byMonth[key].total += b.totalAmount || 0;
  });
  Object.keys(byMonth).sort().forEach(k => {
    const m = byMonth[k];
    console.log(k + ": " + m.count + " reservas, R$ " + m.total.toFixed(2));
  });
  await client.close();
}
run().catch(console.error);
