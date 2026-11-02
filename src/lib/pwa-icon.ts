import sharp from 'sharp';

export async function renderPwaIcon(input:Buffer,size:number){
 const inset=Math.round(size*.82);
 const logo=await sharp(input,{failOn:'none'}).rotate().resize(inset,inset,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
 // Separate pipelines: Sharp applies only the last resize in one pipeline,
 // so extend + another resize previously produced oversized manifest icons.
 return sharp({create:{width:size,height:size,channels:4,background:'#ffffff'}}).composite([{input:logo,gravity:'centre'}]).png().toBuffer();
}
