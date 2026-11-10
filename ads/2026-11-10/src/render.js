const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('http://localhost:8812/'+(process.argv[3]||'index.html')+'');await p.waitForTimeout(2500);
const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium',process.argv[2]]);
for(let f=0;f<20*30;f++){await p.evaluate(t=>window.setFrame(t),f/30);
 if(f==0)await p.waitForTimeout(800);
 const buf=await p.screenshot({type:'jpeg',quality:92});ff.stdin.write(buf);}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await b.close();})();
