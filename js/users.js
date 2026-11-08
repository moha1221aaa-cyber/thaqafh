/* حسابات المستخدمين (الاسم والصورة) للترتيب وملف المتسابق.
   تبويب التوقعات انشال (8 نوفمبر 2026، طلب محمد)، وتوقعات البث المباشر (livePred) مستقلة عنه. */
function startUsersListener() {
if(!firebaseDB) return;

usersRankingListener = firebaseDB.collection("users").onSnapshot(snapshot => {
cachedUsersData = {};
snapshot.forEach(doc => {
cachedUsersData[doc.id] = thumbUser(doc.data());
});
if (typeof bcDeferPage === "function") { tableStats(); bcDeferPage("users", () => { table(); }); }
else { table(); }
});

}
