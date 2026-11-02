import assert from 'node:assert/strict';
import {installHelp} from '../src/lib/install-help';
for(const ua of ['Mozilla iPhone Safari','Mozilla iPad Safari'])assert.match(installHelp(ua).title,/iPhone/);
assert.match(installHelp('Mozilla Macintosh Safari',5).title,/iPhone/);
assert.match(installHelp('Mozilla Android Chrome').title,/Android/);
for(const ua of ['Mozilla Windows Chrome','Mozilla Windows Edg','Mozilla Linux Firefox']){
 const help=installHelp(ua);assert.match(help.title,/máy tính/);assert.ok(!help.steps.join(' ').includes('Chia sẻ'));
 assert.match(help.steps.join(' '),/nếu có|nếu tùy chọn/i);
}
console.log('PASS: iPhone, iPad, iPad desktop UA, Android, Chrome, Edge and unsupported desktop fallback.');
