import {scryptSync,randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('.private/interview',{recursive:true});
const pass = randomBytes(18).toString('hex');
const salt=randomBytes(16);const hash=['scrypt','16384','8','1',salt.toString('base64'),scryptSync(pass,salt,64).toString('base64')].join('$');
const rows=[['preview_admin','admin','free'],['preview_normal','normal','free'],['preview_pro','normal','pro']];
writeFileSync('.private/interview/credentials.json',JSON.stringify({password:pass}),{mode:0o600});
writeFileSync('.private/interview/seed.sql',rows.map(([id,role,plan])=>`INSERT INTO users(id,email,display_name,password_hash,status,role,plan) VALUES('${id}','${id}@skill-compass.invalid','Local Preview','${hash}','active','${role}','${plan}') ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash;`).join('\n'),{mode:0o600});
