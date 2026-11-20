const fs=require('fs');let h=fs.readFileSync('src/index.html','utf8');
const rep=(k,f)=>{h=h.replace('/*__'+k+'__*/',()=>fs.readFileSync(f,'utf8'));};
rep('CSS','src/style.css');rep('CONFIG','src/config.js');rep('QR','node_modules/qrcode-generator/qrcode.js');rep('APP','src/app.js');
fs.writeFileSync('index.html',h);console.log('built',h.length);
