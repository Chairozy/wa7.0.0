const fs = require('fs')
const argv = process.argv.slice(2);

const from = argv[0];
const dest = argv[1];
const ids = argv[2].split(',');

for(let id of ids) {
  moveCreds(id);
}

function moveCreds(id) {
  if (!fs.existsSync(from + '/' + id)) return;
  if (!fs.existsSync(dest))
    fs.mkdirSync(dest);
  if (!fs.existsSync(dest + '/' + id))
    fs.mkdirSync(dest + '/' + id);
  if (fs.existsSync(dest + '/' + id + '/creds.json'))
    fs.rmSync(dest + '/' + id + '/creds.json', { recursive: true, force: true });
  fs.copyFileSync(from + '/' + id + '/creds.json', dest + '/' + id + '/creds.json');
  console.log('copied ' + from + '/' + id + '/creds.json', dest + '/' + id + '/creds.json');
}
