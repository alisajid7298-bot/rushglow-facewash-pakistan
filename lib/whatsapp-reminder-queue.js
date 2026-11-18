'use strict';
const {QueueClient}=require('@vercel/queue');
const queue=new QueueClient({region:'iad1'});
const reminder=require('./whatsapp-reminder');
const handler=queue.handleNodeCallback(async(job,metadata)=>{
 if(metadata.topicName!==reminder.TOPIC||!reminder.verified(job))return;
 const {Pool}=require('@neondatabase/serverless');
 const pool=new Pool({connectionString:process.env.POSTGRES_URL||process.env.DATABASE_URL||process.env.POSTGRES_URL_NON_POOLING,connectionTimeoutMillis:10000});
 try{if(job?.probe===true){await pool.query('UPDATE wa_settings SET reminder_last_check_at=NOW() WHERE id=1');return;}await reminder.deliver(pool,job);}finally{await pool.end();}
},{retry:(error,metadata)=>metadata.deliveryCount>=5?{acknowledge:true}:{afterSeconds:60}});
module.exports={handler,send:queue.send};
