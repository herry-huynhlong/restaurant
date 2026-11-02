import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderPwaIcon}from'../src/lib/pwa-icon';
async function main(){for(const [width,height] of [[1200,600],[300,900],[32,32]])for(const size of [192,512]){
 const source=await sharp({create:{width,height,channels:4,background:'#0f766e'}}).png().toBuffer();
 const output=await renderPwaIcon(source,size),meta=await sharp(output).metadata();assert.equal(meta.width,size);assert.equal(meta.height,size);assert.equal(meta.format,'png');
 const {data,info}=await sharp(output).raw().toBuffer({resolveWithObject:true});assert.deepEqual([...data.subarray(0,3)],[255,255,255]);const middle=(Math.floor(size/2)*size+Math.floor(size/2))*info.channels;assert.deepEqual([...data.subarray(middle,middle+3)],[15,118,110]);
}console.log('PASS: six icon cases, exact 192/512 dimensions, centered logo and safe white margin.');}
main().catch(error=>{console.error(error);process.exitCode=1;});
