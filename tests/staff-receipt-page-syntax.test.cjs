const fs=require('node:fs'),vm=require('node:vm');
for(const file of ['employee-dashboard.html','admin-dashboard.html','branch-dashboard.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const [index,match] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
  if(/type=["']module/.test(match[1]))continue;
  try{new vm.Script(match[2])}catch(error){throw Error(`${file}, inline script ${index}: ${error.message}`)}
 }
 console.log('PASS complete page JavaScript syntax:',file);
}
