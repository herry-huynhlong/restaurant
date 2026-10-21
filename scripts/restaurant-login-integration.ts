import assert from 'node:assert/strict';
import {randomUUID, randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {encode} from 'next-auth/jwt';
import {prisma} from '@/lib/db/prisma';
import {getRestaurantPostLoginPath, getPostLoginPath} from '@/server/services/auth-redirect-service';

const db = new URL(process.env.DATABASE_URL || 'http://invalid');
if(db.hostname!=='127.0.0.1'||db.port!=='55432'||db.pathname!=='/restaurant_trial_test') throw Error('ISOLATED_TEST_REQUIRED');
const base='http://127.0.0.1:3200', prefix='login-'+randomUUID(), password=randomBytes(24).toString('hex');
const jar=new Map<string,string>();
function cookie(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');}
async function request(path:string, init:RequestInit={}){
 const r=await fetch(base+path,{...init,headers:{...init.headers,cookie:cookie()},redirect:'manual'});
 for(const c of r.headers.getSetCookie()) {const pair=c.split(';')[0],i=pair.indexOf('=');if(/max-age=0/i.test(c))jar.delete(pair.slice(0,i));else jar.set(pair.slice(0,i),pair.slice(i+1));}
 return r;
}
async function login(email:string,pw:string){
 const csrf=await (await request('/api/auth/csrf')).json();
 return request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password:pw,callbackUrl:base+'/restaurant-entry',json:'true'})});
}
async function snapshot(){return {trials:await prisma.trialRegistration.count(),requests:await prisma.restaurantSubscriptionRequest.count(),entitlements:await prisma.subscriptionEntitlement.count()};}
async function main(){
 const before=await snapshot();
 const user=await prisma.user.create({data:{name:'Isolated login QA',email:prefix+'@example.test',passwordHash:await bcrypt.hash(password,10),platformRole:'PLATFORM_ADMIN'}});
 const a=await prisma.restaurant.create({data:{name:'Login QA A',slug:prefix+'-a',plan:'TRAIN',planEntitlement:'BASIC',subscriptionEnd:new Date(Date.now()+86400000)}});
 const b=await prisma.restaurant.create({data:{name:'Login QA B',slug:prefix+'-b',plan:'TRAIN',planEntitlement:'BASIC',subscriptionEnd:new Date(Date.now()+86400000)}});
 await prisma.restaurantUser.create({data:{userId:user.id,restaurantId:a.id,role:'OWNER'}});
 assert.match(await (await request('/restaurant-login')).text(),/Đăng nhập nhà hàng/);
 assert.equal((await request('/restaurant-entry')).headers.get('location'),'/restaurant-login');
 assert.equal(await getPostLoginPath(user.id,'PLATFORM_ADMIN'),'/platform');
 assert.equal(await getRestaurantPostLoginPath(user.id),`/${a.slug}/admin`);
 assert.equal(await getRestaurantPostLoginPath(user.id,b.slug),'/unauthorized');
 assert.equal(await getRestaurantPostLoginPath(prefix+'-missing'),'/restaurant-login');
 const bad=await login(user.email,'incorrect-password');
 assert.match(JSON.stringify(await bad.json()),/CredentialsSignin/);
 assert.ok(!jar.has('next-auth.session-token'));
 await login(user.email,password);
 assert.ok(jar.has('next-auth.session-token'));
 assert.equal((await request('/restaurant-entry')).headers.get('location'),`/${a.slug}/admin`);
 assert.equal((await request('/restaurant-login')).headers.get('location'),`/${a.slug}/admin`);
 assert.equal((await request(`/${a.slug}/login?role=OWNER`)).headers.get('location'),`/${a.slug}/admin`);
 assert.equal((await request(`/${b.slug}/admin`)).headers.get('location'),'/unauthorized');
 await prisma.restaurantUser.create({data:{userId:user.id,restaurantId:b.id,role:'OWNER'}});
 assert.equal((await request('/restaurant-entry')).headers.get('location'),'/select-restaurant');
 const picker=await (await request('/select-restaurant')).text();
 assert.ok(picker.includes(`/${a.slug}/admin`)&&picker.includes(`/${b.slug}/admin`));
 await prisma.restaurantUser.update({where:{restaurantId_userId:{restaurantId:b.id,userId:user.id}},data:{isActive:false}});
 const csrf=await (await request('/api/auth/csrf')).json();
 await request('/api/auth/signout',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,json:'true'})});
 assert.equal((await request('/restaurant-entry')).headers.get('location'),'/restaurant-login');
 jar.clear();
 jar.set('next-auth.session-token',await encode({token:{id:user.id,platformRole:'USER',exp:1},secret:process.env.NEXTAUTH_SECRET!,maxAge:-60}));
 assert.match(await (await request('/restaurant-login')).text(),/Đăng nhập nhà hàng/);
 jar.clear();jar.set('qavio_trial_verification','not-a-login-session');
 assert.equal((await request('/restaurant-entry')).headers.get('location'),'/restaurant-login');
 jar.clear();await login(user.email,password);
 assert.equal((await request('/restaurant-entry')).headers.get('location'),`/${a.slug}/admin`);
 assert.deepEqual(await snapshot(),before);
 await prisma.user.update({where:{id:user.id},data:{isActive:false}});
 assert.equal(await getRestaurantPostLoginPath(user.id),'/restaurant-login');
 assert.match(await (await request('/restaurant-login')).text(),/Đăng nhập nhà hàng/);
 console.log('PASS: anonymous, wrong/correct credentials, session resume, tenant isolation, platform separation, multi restaurant, logout/relogin, expired session, verification-cookie separation, no trial/subscription writes');
}
main().catch(()=>{console.error('RESTAURANT_LOGIN_INTEGRATION_FAILED');process.exitCode=1;}).finally(async()=>{
 await prisma.restaurant.deleteMany({where:{slug:{startsWith:prefix}}});
 await prisma.user.deleteMany({where:{email:prefix+'@example.test'}});
 await prisma.$disconnect();
});
