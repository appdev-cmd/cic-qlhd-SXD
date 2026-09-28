import {createConnection,createServer} from 'node:net';

const listening=(port,host)=>new Promise(resolve=>{
  const socket=createConnection({port,host});
  const finish=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(500,()=>finish(false));
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
});

export async function probePort(port){
  // Windows may permit a second bind while an IPv6 listener already owns the port.
  if((await Promise.all(['127.0.0.1','::1'].map(host=>listening(port,host)))).some(Boolean))
    return {port,available:false,code:'EADDRINUSE'};
  return new Promise(resolve=>{
    const server=createServer();
    server.once('error',error=>resolve({port,available:false,code:error.code}));
    server.listen(port,'127.0.0.1',()=>server.close(()=>resolve({port,available:true})));
  });
}
