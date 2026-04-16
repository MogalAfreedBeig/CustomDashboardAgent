// // import * as functions from 'firebase-functions';
// import app from './app.js';
// app.listen("3000", () => console.log('server started'));
// // export const apiv2 = functions.https.onRequest(app);

// for cloud upload
import app from './app.js';

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});