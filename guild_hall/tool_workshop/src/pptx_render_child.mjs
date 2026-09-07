import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const [mode,artifactRoot,input,outputRoot,profilePath]=process.argv.slice(2);
  if(!['template','template-text','render'].includes(mode) || process.argv.length!==(mode==='template-text'?7:6))throw new Error('arguments');
  const {FileBlob,Presentation,PresentationFile}=await import(pathToFileURL(path.join(artifactRoot,'dist/artifact_tool.mjs')).href);
  if(mode==='template' || mode==='template-text') {
    const deck=Presentation.create({slideSize:{width:1280,height:720}});
    const profile=mode==='template-text'?JSON.parse(await fs.readFile(profilePath,'utf8')):null;
    if(profile && (!Array.isArray(profile.slides) || profile.slides.length<2 || profile.slides.length>20))throw new Error('profile');
    for(let index=1;index<=(profile?.slides.length??2);index++) {
      const slide=deck.slides.add();slide.background.fill='#FFFFFF';
      const boxes=profile?.slides[index-1].textboxes??[{placeholder:`{{TITLE_${index}}}`,geometry:[72,48,1136,80],font_size:44,font_family:'Arial'},{placeholder:`{{BODY_${index}}}`,geometry:[72,180,1136,400],font_size:32,font_family:'Arial'}];
      for(const [boxIndex,spec] of boxes.entries()) {
        const [left,top,width,height]=spec.geometry;
        const box=slide.shapes.add({geometry:'textbox',name:profile?`text_${boxIndex+1}`:['title','body'][boxIndex],position:{left,top,width,height},fill:'none',line:{fill:'none',width:0}});
        box.text=spec.placeholder;
        box.text.style={typeface:spec.font_family,fontSize:spec.font_size,bold:boxIndex===0,color:'#142735',autoFit:'none'};
      }
    }
    await (await PresentationFile.exportPptx(deck)).save(input);
  }
  const presentation=await PresentationFile.importPptx(await FileBlob.load(input));
  const count=presentation.slides.items.length;
  if(count<2 || count>20)throw new Error('slide_count');
  for(let index=0;index<count;index++) {
    const png=await presentation.export({slide:presentation.slides.items[index],format:'png',scale:1});
    await fs.writeFile(path.join(outputRoot,`slide-${index+1}.png`),Buffer.from(await png.arrayBuffer()),{flag:'wx'});
  }
  process.stdout.write(JSON.stringify({slide_count:count}));
} catch {process.stderr.write('pptx_render_failed');process.exitCode=1;}
