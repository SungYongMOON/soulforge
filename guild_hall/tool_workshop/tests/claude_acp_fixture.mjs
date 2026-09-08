import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadBinding, sha256, SOURCE_FILES } from '../src/claude_acp_policy.mjs';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
let fakeCli;
export function fakeClaudeExecutable() {
  if (fakeCli) return fakeCli;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soulforge-fake-claude-'));
  // This is a synthetic executable; it neither invokes Claude nor contacts a model.
  if (process.platform === 'win32') {
    const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    const source = path.join(root, 'FakeClaude.cs');
    fs.writeFileSync(source, `using System; using System.IO; using System.Collections.Generic; using System.Web.Script.Serialization;
class FakeClaude { static JavaScriptSerializer json = new JavaScriptSerializer();
static string Get(string[] a,string k){int i=Array.IndexOf(a,k);return i<0?"":a[i+1];}
static void Emit(object x){Console.WriteLine(json.Serialize(x));Console.Out.Flush();}
static void Main(string[] args){ if(Array.IndexOf(args,"--help")>=0){Console.WriteLine("--strict-mcp-config --mcp-config --setting-sources --settings --tools --disable-slash-commands --no-session-persistence --input-format --output-format --permission-mode --allowedTools --system-prompt --model"); return;}
if(args.Length==3 && args[0]=="auth" && args[1]=="status" && args[2]=="--json"){
File.AppendAllText("auth-probe-count.txt","1");File.WriteAllText("auth-argv.json",json.Serialize(new {args=args,cwd=Directory.GetCurrentDirectory(),inheritedBuzz=Environment.GetEnvironmentVariable("BUZZ_PRIVATE_KEY"),inheritedNode=Environment.GetEnvironmentVariable("NODE_OPTIONS"),inheritedProvider=Environment.GetEnvironmentVariable("ANTHROPIC_BASE_URL")}));
string auth=File.ReadAllText("fake-auth-mode.txt");Console.Error.WriteLine("SYNTHETIC_PRIVATE_AUTH_STDERR");
if(auth=="wait")System.Threading.Thread.Sleep(30000);
if(auth=="oversized")Console.WriteLine(new string('x',17000));else if(auth=="malformed")Console.WriteLine("not json");else if(auth=="wrong-shape")Emit(new {loggedIn="true",authMethod="claude.ai"});else if(auth=="bad-method")Emit(new {loggedIn=true,authMethod="SYNTHETIC_PRIVATE_METHOD"});else Emit(new {loggedIn=auth!="false",authMethod=auth=="false"?"none":"claude.ai",email="SYNTHETIC_PRIVATE_EMAIL",token="SYNTHETIC_PRIVATE_TOKEN"});
Environment.ExitCode=(auth=="false" || auth=="wrong-exit")?1:0;return;}
File.WriteAllText("child-argv.json",json.Serialize(new {args=args,cwd=Directory.GetCurrentDirectory(),inheritedBuzz=Environment.GetEnvironmentVariable("BUZZ_PRIVATE_KEY"),inheritedNode=Environment.GetEnvironmentVariable("NODE_OPTIONS"),inheritedProvider=Environment.GetEnvironmentVariable("ANTHROPIC_BASE_URL")}));
File.AppendAllText("child-start-count.txt","1");
var names = new List<string>(); int start=Array.IndexOf(args,"--allowedTools")+1;while(start>0 && start<args.Length && !args[start].StartsWith("--")){names.Add(args[start++]);}
string mode=Get(args,"--system-prompt"); int users=0;var controls=new List<string>(); bool emitted=false;
string line;while((line=Console.ReadLine())!=null){var m=json.Deserialize<Dictionary<string,object>>(line);
if((string)m["type"]=="control_request"){var req=(Dictionary<string,object>)m["request"];string kind=(string)req["subtype"];controls.Add(kind);File.WriteAllText("received-controls.json",json.Serialize(controls));object payload;
if(mode=="WAIT_CONTEXT" && kind=="get_context_usage")System.Threading.Thread.Sleep(1000);
if(kind=="initialize") payload=mode=="NO_INIT"?(object)new {commands=new[]{"unexpected-skill"},current_permission_mode="default"}:new {commands=new string[]{},current_permission_mode="default"};
else if(kind=="mcp_status"){var tools=new List<object>();foreach(string n in names)tools.Add(new{name=n.Substring("mcp__soulforge_workspace__".Length)});if(mode=="BAD_TOOLS")tools.Add(new{name="Bash"});payload=new {mcpServers=new[]{new {name="soulforge_workspace",status="connected",tools=tools}}};}
else{var tools=new List<object>();foreach(string n in names)tools.Add(new {name=n,serverName="soulforge_workspace"});payload=new {model=Get(args,"--model"),memoryFiles=new object[]{},agents=new object[]{},mcpTools=tools};}
Emit(new {type="control_response",response=new {subtype="success",request_id=m["request_id"],response=payload}});continue;}
if((string)m["type"]!="user")continue;users++;File.WriteAllText("received-user-count.txt",users.ToString());
if(!emitted && mode!="FAIL_BEFORE_INIT"){Emit(new {type="system",subtype="init",tools=names,cwd=Directory.GetCurrentDirectory(),model=Get(args,"--model"),mcp_servers=new[]{new{name="soulforge_workspace",status="connected"}}});emitted=true;}
if(File.Exists("native-result.json")){Emit(json.Deserialize<object>(File.ReadAllText("native-result.json")));continue;}
if(File.Exists("native-assistant.json")){Emit(json.Deserialize<object>(File.ReadAllText("native-assistant.json")));continue;}
if(mode=="FAIL_RESULT"){Emit(new {type="result",subtype="error_during_execution",is_error=true,errors=new[]{"SYNTHETIC_PRIVATE_FAILURE_DO_NOT_FORWARD"}});continue;}
if(mode=="WAIT")continue;var content=new List<object>();content.Add(new{type="text",text="synthetic reply"});if(mode=="TEXT_BASH")content.Add(new{type="tool_use",name="Bash",id="bad",input=new{command="synthetic"}}); Emit(new {type="assistant",message=new {content=content}});Emit(new {type="result",subtype="success",is_error=false});}
}}
`);
    fakeCli = path.join(root, 'fake-claude.exe');
    const result = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${fakeCli}`, '/reference:System.Web.Extensions.dll', source], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`Fixture compilation failed: ${result.stdout}`);
  } else {
    fakeCli = path.join(root, 'fake-claude');
    fs.writeFileSync(fakeCli, `#!${process.execPath}
const fs = require('node:fs'); const readline = require('node:readline'); const a=process.argv.slice(2);const get=k=>a[a.indexOf(k)+1];
if(a.includes('--help')){console.log('--strict-mcp-config --mcp-config --setting-sources --settings --tools --disable-slash-commands --no-session-persistence --input-format --output-format --permission-mode --allowedTools --system-prompt --model');process.exit(0);}
if(a.length===3&&a[0]==='auth'&&a[1]==='status'&&a[2]==='--json'){
fs.appendFileSync('auth-probe-count.txt','1');fs.writeFileSync('auth-argv.json',JSON.stringify({args:a,cwd:process.cwd(),inheritedBuzz:process.env.BUZZ_PRIVATE_KEY??null,inheritedNode:process.env.NODE_OPTIONS??null,inheritedProvider:process.env.ANTHROPIC_BASE_URL??null}));const auth=fs.readFileSync('fake-auth-mode.txt','utf8');console.error('SYNTHETIC_PRIVATE_AUTH_STDERR');
if(auth==='wait')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
console.log(auth==='oversized'?'x'.repeat(17000):auth==='malformed'?'not json':JSON.stringify(auth==='wrong-shape'?{loggedIn:'true',authMethod:'claude.ai'}:auth==='bad-method'?{loggedIn:true,authMethod:'SYNTHETIC_PRIVATE_METHOD'}:{loggedIn:auth!=='false',authMethod:auth==='false'?'none':'claude.ai',email:'SYNTHETIC_PRIVATE_EMAIL',token:'SYNTHETIC_PRIVATE_TOKEN'}));process.exitCode=auth==='false'||auth==='wrong-exit'?1:0;
}else{
fs.writeFileSync('child-argv.json',JSON.stringify({args:a,cwd:process.cwd(),inheritedBuzz:process.env.BUZZ_PRIVATE_KEY??null,inheritedNode:process.env.NODE_OPTIONS??null,inheritedProvider:process.env.ANTHROPIC_BASE_URL??null}));
fs.appendFileSync('child-start-count.txt','1');
const names=[];for(let i=a.indexOf('--allowedTools')+1;i<a.length&&!a[i].startsWith('--');i++)names.push(a[i]);const mode=get('--system-prompt');let users=0,emitted=false;const controls=[];
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.type==='control_request'){const kind=m.request.subtype;controls.push(kind);fs.writeFileSync('received-controls.json',JSON.stringify(controls));let payload;
if(mode==='WAIT_CONTEXT'&&kind==='get_context_usage')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);
if(kind==='initialize')payload={commands:mode==='NO_INIT'?['unexpected-skill']:[],current_permission_mode:'default'};
else if(kind==='mcp_status')payload={mcpServers:[{name:'soulforge_workspace',status:'connected',tools:[...names.map(n=>({name:n.slice('mcp__soulforge_workspace__'.length)})),...(mode==='BAD_TOOLS'?[{name:'Bash'}]:[])]}]};
else payload={model:get('--model'),memoryFiles:[],agents:[],mcpTools:names.map(name=>({name,serverName:'soulforge_workspace'}))};
console.log(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:payload}}));return;}
if(m.type!=='user')return;fs.writeFileSync('received-user-count.txt',String(++users));if(!emitted&&mode!=='FAIL_BEFORE_INIT'){console.log(JSON.stringify({type:'system',subtype:'init',tools:names,cwd:process.cwd(),model:get('--model'),mcp_servers:[{name:'soulforge_workspace',status:'connected'}]}));emitted=true;}
if(fs.existsSync('native-result.json')){console.log(fs.readFileSync('native-result.json','utf8'));return;}
if(fs.existsSync('native-assistant.json')){console.log(fs.readFileSync('native-assistant.json','utf8'));return;}
if(mode==='FAIL_RESULT'){console.log(JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,errors:['SYNTHETIC_PRIVATE_FAILURE_DO_NOT_FORWARD']}));return;}
if(mode==='WAIT')return;console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'synthetic reply'},...(mode==='TEXT_BASH'?[{type:'tool_use',name:'Bash',id:'bad',input:{command:'synthetic'}}]:[])]}}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false}));});
}
`); fs.chmodSync(fakeCli, 0o700);
  }
  return fakeCli;
}
const nodeHash = sha256(fs.readFileSync(process.execPath));
export function fixture({ mode = 'synthetic instructions', auth = 'authenticated', tools = ['workspace_list', 'workspace_read_text', 'workspace_write_text'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soulforge-claude-scope-'));
  const workRoot = path.join(root, 'bot'); const jobRoot = path.join(workRoot, 'JOBS', 'job-one');
  fs.mkdirSync(jobRoot, { recursive: true });
  fs.writeFileSync(path.join(jobRoot, 'fake-auth-mode.txt'), auth);
  const instruction = path.join(workRoot, 'AGENTS.md'); fs.writeFileSync(instruction, mode);
  const cliPath = fakeClaudeExecutable();
  const raw = { version: 1, botRef: 'bot.synthetic', roleRef: 'role.tool', projectRef: 'project.synthetic', jobRef: 'job-one', inputFiles: [], workRoot, jobRoot, model: 'claude-synthetic-test-model', cliPath, cliSha256: sha256(fs.readFileSync(cliPath)), nodeSha256: nodeHash, instructions: { ref: 'instruction.one', path: instruction, sha256: sha256(Buffer.from(mode)) }, skills: [], tools, sourceHashes: Object.fromEntries(SOURCE_FILES.map(file => [file, sha256(fs.readFileSync(path.join(src, file)))])), expiresAt: Date.now() + 600000 };
  const bindingPath = path.join(root, 'binding.json');
  const pin = () => { const bytes = Buffer.from(JSON.stringify(raw)); fs.writeFileSync(bindingPath, bytes); return sha256(bytes); };
  const hash = pin();
  return { root, raw, jobRoot, bindingPath, hash, pin, load: () => loadBinding(bindingPath, sha256(fs.readFileSync(bindingPath))) };
}
