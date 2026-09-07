import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const [mode,artifactRoot,input,outputRoot]=process.argv.slice(2);
  if(process.argv.length!==6 || !['template','render'].includes(mode))throw new Error('arguments');
  const {FileBlob,Presentation,PresentationFile}=await import(pathToFileURL(path.join(artifactRoot,'dist/artifact_tool.mjs')).href);
  if(mode==='template') {
    const deck=Presentation.create({slideSize:{width:1280,height:720}});
    for(let index=1;index<=2;index++) {
      const slide=deck.slides.add();slide.background.fill='#FFFFFF';
      for(const [name,top,height,fontSize,bold] of [['TITLE',48,80,44,true],['BODY',180,400,32,false]]) {
        const box=slide.shapes.add({geometry:'textbox',name:name.toLowerCase(),position:{left:72,top,width:1136,height},fill:'none',line:{fill:'none',width:0}});
        box.text=`{{${name}_${index}}}`;
        box.text.style={typeface:'Arial',fontSize,bold,color:'#142735',autoFit:'none'};
      }
    }
    await (await PresentationFile.exportPptx(deck)).save(input);
  }
  const presentation=await PresentationFile.importPptx(await FileBlob.load(input));
  if(presentation.slides.items.length!==2)throw new Error('slide_count');
  for(let index=0;index<2;index++) {
    const png=await presentation.export({slide:presentation.slides.items[index],format:'png',scale:1});
    await fs.writeFile(path.join(outputRoot,`slide-${index+1}.png`),Buffer.from(await png.arrayBuffer()),{flag:'wx'});
  }
  process.stdout.write(JSON.stringify({slide_count:2}));
} catch {process.stderr.write('pptx_render_failed');process.exitCode=1;}
