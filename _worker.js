const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
const names = {artist:'Artist',date:'Event date',event:'Event',venue:'Venue',location:'City / country',time:'Performance time',capacity:'Capacity',flights:'Flights',hotel:'Hotel',transport:'Ground transport',currency:'Currency',budget:'Budget',firstName:'First name',lastName:'Last name',email:'Email',phone:'Phone',company:'Company',referral:'Referred by',notes:'Notes'};
async function handleContact(request,env,kind='contact'){
  if(request.method!=='POST')return json({ok:false,message:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({ok:false,message:'Please submit from our website.'},403);
  if(!env.DB||!env.BOOKING_EMAIL||!env.SITE_MAIL_TOKEN)return json({ok:false,message:'Contact is temporarily unavailable. Please try again later.'},503);
  if(Number(request.headers.get('Content-Length')||0)>16000)return json({ok:false,message:'Request too large.'},413);
  let data;
  try{const raw=await request.text();if(raw.length>16000)return json({ok:false,message:'Request too large.'},413);data=JSON.parse(raw);}catch{return json({ok:false,message:'Invalid request.'},400);}
  if(!data||typeof data!=='object'||data.website||data.consent!=='on')return json({ok:false,message:'Please complete the required fields.'},400);
  if(kind==='demo'){
    if(typeof data.soundcloud!=='string'||data.soundcloud.length>1500||typeof data.message!=='string'||data.message.length>1200)return json({ok:false,message:'Please check your private SoundCloud link and message.'},400);
    let valid=false;
    try{const link=new URL(data.soundcloud.trim());const parts=link.pathname.split('/').filter(Boolean);valid=link.protocol==='https:'&&['soundcloud.com','www.soundcloud.com'].includes(link.hostname)&&!link.username&&!link.password&&((parts.length>=3&&/^s-[a-z0-9]+$/i.test(parts[2]))||(parts.length>=2&&/^s-[a-z0-9]+$/i.test(link.searchParams.get('secret_token')||'')));}catch{}
    if(!valid)return json({ok:false,message:'Only full private SoundCloud sharing links are accepted.'},400);
    data.subject='Demo submission';data.message=`Private SoundCloud link: ${data.soundcloud.trim()}\n\n${data.message.trim()}`;
  }
  const details={type:kind};
  for(const key of ['name','email','subject','message']){if(typeof data[key]!=='string')return json({ok:false,message:'Please complete the required fields.'},400);details[key]=data[key].trim();if(!details[key]||details[key].length>(key==='message'?3000:254))return json({ok:false,message:'Please check your entries.'},400);}
  if(!/^\S+@\S+\.\S+$/.test(details.email)||/[\r\n]/.test(details.email)||!(kind==='demo'?['Demo submission']:['General enquiry','Collaboration','MAMACITA','IBIZA WHITE','KOTINGAA','BEAT CIGAR NATION','PUNTA CANA MUSIC WEEK']).includes(details.subject))return json({ok:false,message:'Please check your email and subject.'},400);
  if(typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))return json({ok:false,message:'Invalid request reference.'},400);
  const reference=data.requestId;
  try{
    const existing=await env.DB.prepare('SELECT id,notification_sent FROM booking_requests WHERE id=?').bind(reference).first();
    if(existing?.notification_sent)return json({ok:true,reference});
    if(!existing){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kind+':'+(request.headers.get('CF-Connecting-IP')||'unknown')+new Date().toISOString().slice(0,10)));
      const key=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
      const rate=await env.DB.prepare('INSERT INTO booking_limits(key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first();
      if(rate.count>10)return json({ok:false,message:'Too many messages. Please try again tomorrow.'},429);
      await env.DB.prepare('INSERT OR IGNORE INTO booking_requests(id,details) VALUES (?,?)').bind(reference,JSON.stringify(details)).run();
    }
    const text=`New contact message — MIAMI 305 Recordings\nReference: ${reference}\nName: ${details.name}\nEmail: ${details.email}\nSubject: ${details.subject}\n\n${details.message}`;
    const sent=await fetch('https://yapanel.yadominios.com/api/hosting/correo/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sitio:'sis-producciones',token:env.SITE_MAIL_TOKEN,from:{address:'bookings@miami305team.com',name:'MIAMI 305 Recordings'},to:[{address:env.BOOKING_EMAIL}],reply_to:details.email,subject:`Contact · ${details.subject}`,text})});
    const result=await sent.json().catch(()=>({}));
    if(!sent.ok||result.ok===false)return json({ok:false,message:'Your message was saved, but the notification could not be delivered. Please retry to complete your enquiry.'},502);
    await env.DB.prepare('UPDATE booking_requests SET notification_sent=1 WHERE id=?').bind(reference).run();
    return json({ok:true,reference});
  }catch{return json({ok:false,message:'Unable to send your message. Please try again.'},503);}
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/demo-request') return handleContact(request,env,'demo');
    if (url.pathname === '/contact-request') return handleContact(request,env);
    if (url.pathname !== '/booking-request') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ok:false,message:'Method not allowed.'},405);
    if (request.headers.get('Origin') !== url.origin) return json({ok:false,message:'Please submit from our website.'},403);
    if (!env.DB || !env.BOOKING_EMAIL || !env.SITE_MAIL_TOKEN) return json({ok:false,message:'Booking is temporarily unavailable. Please try again later.'},503);
    if (Number(request.headers.get('Content-Length')||0)>16000) return json({ok:false,message:'Request too large.'},413);
    let data;
    try {const raw=await request.text();if(raw.length>16000) return json({ok:false,message:'Request too large.'},413);data=JSON.parse(raw);} catch {return json({ok:false,message:'Invalid request.'},400);}
    if (!data || typeof data !== 'object' || data.website) return json({ok:false,message:'Invalid request.'},400);
    const details={};
    for (const key of Object.keys(names)) {if(data[key]!==undefined&&typeof data[key]!=='string')return json({ok:false,message:'Invalid field.'},400);details[key]=(data[key]||'').trim();if(details[key].length>(key==='notes'?3000:254))return json({ok:false,message:'Please shorten your entry.'},400);}
    const required=['date','event','venue','location','flights','hotel','transport','currency','budget','firstName','lastName','email'];
    if(required.some(key=>!details[key])||data.consent!=='on'||!['MR. MAUI','ELI ROJAS','KARO GOMEZ','MISS M','EDWARD MAYA','MIKE SYNTEC'].includes(details.artist)||!/^\S+@\S+\.\S+$/.test(details.email)||/[\r\n]/.test(details.email)) return json({ok:false,message:'Please complete all required fields.'},400);
    const date=new Date(details.date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(details.date)||Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==details.date||details.date<new Date().toISOString().slice(0,10))return json({ok:false,message:'Please choose a valid future event date.'},400);
    if(!['EUR','USD'].includes(details.currency)||!['1,000–3,000','3,000–7,000','7,000–15,000','15,000+'].includes(details.budget)||['flights','hotel','transport'].some(key=>!['Yes','No'].includes(details[key])))return json({ok:false,message:'Please select valid options.'},400);
    if(typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))return json({ok:false,message:'Invalid request reference.'},400);
    const reference=data.requestId;
    try {
      const existing=await env.DB.prepare('SELECT id,notification_sent FROM booking_requests WHERE id=?').bind(reference).first();
      if(existing?.notification_sent)return json({ok:true,reference});
      if(!existing){
        const ip=request.headers.get('CF-Connecting-IP')||'unknown';
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+new Date().toISOString().slice(0,10)));
        const key=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
        const rate=await env.DB.prepare('INSERT INTO booking_limits(key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first();
        if(rate.count>10)return json({ok:false,message:'Too many requests. Please try again tomorrow.'},429);
        await env.DB.prepare('INSERT OR IGNORE INTO booking_requests(id,details) VALUES (?,?)').bind(reference,JSON.stringify(details)).run();
      }
      const text=`New booking request — MIAMI 305 Recordings\nReference: ${reference}\n\n`+Object.entries(details).filter(([,value])=>value).map(([key,value])=>`${names[key]}: ${value}`).join('\n');
      const sent=await fetch('https://yapanel.yadominios.com/api/hosting/correo/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sitio:'sis-producciones',token:env.SITE_MAIL_TOKEN,from:{address:'bookings@miami305team.com',name:'MIAMI 305 Recordings'},to:[{address:env.BOOKING_EMAIL}],reply_to:details.email,subject:`Booking request · ${details.artist}`,text})});
      const sentResult=await sent.json().catch(()=>({}));
      if(!sent.ok||sentResult.ok===false)return json({ok:false,message:'Your details were saved, but the notification could not be delivered. Please retry to complete your request.'},502);
      await env.DB.prepare('UPDATE booking_requests SET notification_sent=1 WHERE id=?').bind(reference).run();
      return json({ok:true,reference});
    } catch {return json({ok:false,message:'Unable to complete your request. Please try again.'},503);}
  }
};
