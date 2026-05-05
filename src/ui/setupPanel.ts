import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { AgentConfigStore } from '../core/agentConfig';
import { RepoSyncStore } from '../core/repoSyncStore';
import {
  DetectedAgentCandidate, AgentTargetConfig,
  ItemType, TargetLocationConfig, FileLayout, FileExtensionFormat,
} from '../core/types';
import { PathUtils } from '../utils/pathUtils';
import { getNonce, getBaseStyles, getBaseScriptSetup } from './webviewHtml';

const CONTENT_TYPES: readonly ItemType[] = ['skill', 'rule', 'hook', 'workflow', 'agent'];

const PATH_HINTS: Record<ItemType, string> = {
  skill: '.kiro/steering  or  .cursor/rules',
  rule: '.kiro/steering  or  .github/instructions',
  hook: '.kiro/hooks',
  workflow: '.kiro/steering  or  .cursor/rules',
  agent: '.kiro/steering  or  .github/prompts',
};

export class SetupPanel {
  private panel: vscode.WebviewPanel | undefined;
  private onSyncRequested: (() => Promise<void>) | undefined;
  private lastCandidates: DetectedAgentCandidate[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agentConfig: AgentConfigStore,
    private readonly pathUtils: PathUtils,
    private readonly repoSyncStore?: RepoSyncStore,
  ) {}

  setSyncCallback(cb: () => Promise<void>): void { this.onSyncRequested = cb; }

  open(candidates: DetectedAgentCandidate[]): void {
    this.lastCandidates = candidates;
    this.ensurePanel();
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(candidates);
  }

  openForAgent(config: AgentTargetConfig): void {
    this.ensurePanel();
    if (!this.panel) return;
    this.panel.webview.postMessage({ type: 'expandAgent', id: config.id });
  }

  dispose(): void { this.panel?.dispose(); }

  private ensurePanel(): void {
    if (this.panel) { this.panel.reveal(vscode.ViewColumn.One); return; }
    this.panel = vscode.window.createWebviewPanel(
      'aiAgentHub.setupPanel', 'AI Agent Hub — Setup',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri] });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((msg: Msg) => this.onMsg(msg));
  }

  private onMsg(msg: Msg): void {
    switch (msg.type) {
      case 'saveAgentConfig': this.onSave(msg.config); break;
      case 'removeAgent': this.onRemove(msg.id); break;
      case 'addManualAgent': this.onAdd(msg.displayName, msg.extensionId); break;
      case 'addRepoToAgent': this.onAddRepo(msg.agentId, msg.repoName, msg.repoPath); break;
    }
  }

  private async onSave(raw?: Partial<AgentTargetConfig>): Promise<void> {
    if (!raw) return;
    const errors: string[] = [];
    for (const ct of CONTENT_TYPES) {
      const t = raw.targets?.[ct];
      if (t?.enabled) {
        if (!t.path?.trim()) errors.push(`${ct}s: folder path is required`);
        else if (this.pathUtils.isUnsafePath(t.path)) errors.push(`${ct}s: unsafe path`);
      }
    }
    if (errors.length > 0) { this.post({ type: 'validationErrors', id: raw.id, errors }); return; }

    const now = new Date().toISOString();
    const prev = raw.id ? this.agentConfig.get(raw.id) : undefined;
    const config: AgentTargetConfig = {
      id: prev?.id ?? raw.id ?? randomUUID(),
      displayName: raw.displayName ?? '', extensionId: raw.extensionId ?? '',
      enabled: raw.enabled ?? true,
      targets: buildTargets(raw.targets),
      autoSync: raw.autoSync ?? false,
      createdAt: prev?.createdAt ?? now, updatedAt: now,
    };
    this.agentConfig.save(config);
    this.post({ type: 'saved', id: config.id });
    vscode.window.showInformationMessage(`"${config.displayName}" saved. Syncing…`);
    if (this.onSyncRequested) {
      try { await this.onSyncRequested(); }
      catch (err) { vscode.window.showErrorMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }

  private onRemove(id?: string): void {
    if (!id) return;
    this.agentConfig.delete(id);
    this.post({ type: 'removed', id });
  }

  private onAdd(dn?: string, _ext?: string): void {
    if (!dn) { this.post({ type: 'validationErrors', id: '', errors: ['Agent name is required.'] }); return; }
    const now = new Date().toISOString();
    const slug = dn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const config: AgentTargetConfig = {
      id: randomUUID(), displayName: dn, extensionId: `manual.${slug}`, enabled: true,
      targets: defaultTargets(), autoSync: false, createdAt: now, updatedAt: now,
    };
    this.agentConfig.save(config);
    if (this.panel) {
      this.panel.webview.html = this.buildHtml(this.lastCandidates);
      setTimeout(() => this.panel?.webview.postMessage({ type: 'expandAgent', id: config.id }), 100);
    }
  }

  private async onAddRepo(agentId?: string, repoName?: string, repoPath?: string): Promise<void> {
    if (!agentId || !repoName || !repoPath) {
      this.post({ type: 'validationErrors', id: agentId ?? '', errors: ['Repo name and path are required.'] });
      return;
    }
    if (this.pathUtils.isUnsafePath(repoPath)) {
      this.post({ type: 'validationErrors', id: agentId, errors: ['Unsafe repo path.'] });
      return;
    }
    if (!this.repoSyncStore) { return; }

    const allTypes: ItemType[] = ['skill', 'rule', 'hook', 'workflow', 'agent'];
    this.repoSyncStore.addTarget(repoName, repoPath, agentId, allTypes);
    this.post({ type: 'repoAdded', agentId, repoName, repoPath });
    vscode.window.showInformationMessage(`Repo "${repoName}" added for sync.`);
  }

  private post(msg: Record<string, unknown>): void { this.panel?.webview.postMessage(msg); }

  private buildHtml(candidates: DetectedAgentCandidate[]): string {
    const nonce = getNonce();
    const configs = this.agentConfig.getAll();

    const cards = candidates.length > 0
      ? candidates.map((c) => {
          const cfg = configs.find((x) => x.extensionId === c.extensionId);
          return this.card(c.displayName, c.extensionId, c.description, c.confidence, cfg);
        }).join('')
      : '<p style="opacity:0.6;">No AI agent extensions detected. Add one manually below.</p>';

    const extra = configs
      .filter((cfg) => !candidates.some((c) => c.extensionId === cfg.extensionId))
      .map((cfg) => this.card(cfg.displayName, cfg.extensionId, '', undefined, cfg))
      .join('');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">
    ${getBaseStyles()}
    .card{margin-bottom:10px;border:1px solid var(--vscode-panel-border);border-radius:6px}
    .card-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer}
    .card-hdr:hover{background:var(--vscode-list-hoverBackground)}
    .card-body{display:none;padding:0 14px 14px;border-top:1px solid var(--vscode-panel-border)}
    .card-body.open{display:block}
    .dim{opacity:0.6;font-size:0.9em}
    .ct-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid var(--vscode-panel-border);border-radius:4px}
    .ct-label{font-weight:600;text-transform:capitalize;min-width:60px}
    .layout-toggle{display:flex;gap:4px;align-items:center;font-size:0.85em}
    .layout-toggle label{cursor:pointer;padding:3px 8px;border:1px solid var(--vscode-panel-border);border-radius:3px}
    .layout-toggle input:checked+label{background:var(--vscode-focusBorder);color:#fff;border-color:var(--vscode-focusBorder)}
    .layout-toggle input{display:none}
    .ok{padding:6px 10px;border-radius:4px;margin-top:8px;background:rgba(115,201,145,0.15);color:var(--vscode-testing-iconPassed,#73c991)}
    .err{padding:6px 10px;border-radius:4px;margin-top:4px;background:rgba(244,135,113,0.15);color:var(--vscode-errorForeground,#f48771)}
    .acts{display:flex;gap:8px;margin-top:10px}
    .hint{font-size:0.8em;opacity:0.5;margin-top:2px}
  </style>
</head>
<body>
  <h1>AI Agent Hub — Setup</h1>
  <p class="dim" style="margin-bottom:14px;">
    For each agent, set the folder path for skills, rules, and hooks.<br/>
    Choose how files are saved: <strong>flat</strong> (<code>folder/item-name.md</code>) or
    <strong>subfolder</strong> (<code>folder/item-name/SKILL.md</code>).
  </p>

  <div id="agents">${cards}${extra}</div>

  <h2 style="margin-top:20px;">Add Agent Manually</h2>
  <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:20px;">
    <div style="flex:1"><label class="dim">Agent Name</label>
      <input type="text" id="m-name" placeholder="e.g. Cursor, Windsurf, My Custom Agent" style="width:100%" /></div>
    <button class="btn-primary" id="btn-add">Add</button>
  </div>
  <div id="m-err"></div>

  <script nonce="${nonce}">
    ${getBaseScriptSetup()}
    var meta=${JSON.stringify(Object.fromEntries(configs.map((c)=>[c.id,{id:c.id,dn:c.displayName,ext:c.extensionId}])))};

    document.addEventListener('click',function(ev){
      var hdr=ev.target.closest('.card-hdr');
      if(hdr){hdr.nextElementSibling.classList.toggle('open');return;}
      var btn=ev.target.closest('[data-act]');
      if(!btn)return;
      var a=btn.getAttribute('data-act');
      if(a==='save')saveAgent(btn.getAttribute('data-id'));
      else if(a==='remove')postMsg('removeAgent',{id:btn.getAttribute('data-id')});
      else if(a==='init')postMsg('addManualAgent',{displayName:btn.getAttribute('data-dn'),extensionId:btn.getAttribute('data-ext')});
      else if(a==='addRepo')addRepo(btn.getAttribute('data-id'));
    });

    document.getElementById('btn-add').addEventListener('click',function(){
      var n=document.getElementById('m-name').value.trim();
      if(!n){document.getElementById('m-err').innerHTML='<p class="err">Agent name is required.</p>';return;}
      document.getElementById('m-err').innerHTML='';
      postMsg('addManualAgent',{displayName:n,extensionId:''});
    });

    function saveAgent(id){
      document.querySelectorAll('.st[data-id="'+id+'"]').forEach(function(el){el.innerHTML='';});
      var m=meta[id]||{};
      var targets={};
      ['skill','rule','hook','workflow','agent'].forEach(function(ct){
        var en=document.querySelector('.en[data-id="'+id+'"][data-ct="'+ct+'"]');
        var pa=document.querySelector('.pa[data-id="'+id+'"][data-ct="'+ct+'"]');
        var flat=document.querySelector('.layout-flat[data-id="'+id+'"][data-ct="'+ct+'"]');
        var extSel=document.querySelector('.ext-sel[data-id="'+id+'"][data-ct="'+ct+'"]');
        targets[ct]={
          enabled:en?en.checked:false,
          path:pa?pa.value.trim():'',
          fileLayout:flat&&flat.checked?'flat':'subfolder',
          fileExtension:extSel?extSel.value:'md'
        };
      });
      postMsg('saveAgentConfig',{config:{id:id,displayName:m.dn||'',extensionId:m.ext||'',enabled:true,targets:targets,autoSync:false}});
    }

    function addRepo(agentId){
      var nameEl=document.querySelector('.repo-name[data-id="'+agentId+'"]');
      var pathEl=document.querySelector('.repo-path[data-id="'+agentId+'"]');
      var name=nameEl?nameEl.value.trim():'';
      var path=pathEl?pathEl.value.trim():'';
      if(!name||!path){
        var st=document.querySelector('.st[data-id="'+agentId+'"]');
        if(st)st.innerHTML='<div class="err">Repo name and path are required.</div>';
        return;
      }
      postMsg('addRepoToAgent',{agentId:agentId,repoName:name,repoPath:path});
      if(nameEl)nameEl.value='';
      if(pathEl)pathEl.value='';
    }

    window.addEventListener('message',function(ev){
      var msg=ev.data;
      if(msg.type==='saved'){var s=document.querySelector('.st[data-id="'+msg.id+'"]');if(s)s.innerHTML='<div class="ok">Saved and synced.</div>';}
      else if(msg.type==='validationErrors'){var s2=document.querySelector('.st[data-id="'+msg.id+'"]');if(s2)s2.innerHTML=(msg.errors||[]).map(function(e){return'<div class="err">'+esc(e)+'</div>';}).join('');}
      else if(msg.type==='removed'){var c=document.querySelector('[data-agent-id="'+msg.id+'"]');if(c)c.remove();}
      else if(msg.type==='expandAgent'){var b=document.getElementById('body-'+msg.id);if(b)b.classList.add('open');}
      else if(msg.type==='repoAdded'){var rl=document.querySelector('.repo-list[data-id="'+msg.agentId+'"]');if(rl)rl.innerHTML+='<div class="ok" style="margin-top:4px;">✓ '+esc(msg.repoName)+' → '+esc(msg.repoPath)+'</div>';}
    });
    function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  </script>
</body>
</html>`;
  }

  private card(dn: string, ext: string, desc: string,
    conf: 'high'|'medium'|'low'|undefined, cfg?: AgentTargetConfig): string {
    const id = cfg?.id ?? '';
    const cb = conf ? `<span class="badge badge-${conf}">${conf}</span>` : '';
    const cfgb = cfg ? '<span class="badge badge-user">configured</span>' : '';
    const body = cfg ? this.configRows(cfg)
      : `<p class="dim">Not configured yet.</p>
         <button class="btn-primary" data-act="init" data-dn="${h(dn)}" data-ext="${h(ext)}">Configure</button>`;
    const extLabel = ext.startsWith('manual.') ? '' : `<span class="dim">${h(ext)}</span>`;
    return `<div class="card" data-agent-id="${id}" data-ext="${h(ext)}">
      <div class="card-hdr"><div><strong>${h(dn)}</strong> ${extLabel} ${cb} ${cfgb}</div><span>&#9660;</span></div>
      <div class="card-body" id="body-${id||h(ext)}">${desc?`<p class="dim" style="margin-bottom:8px">${h(desc)}</p>`:''}${body}</div>
    </div>`;
  }

  private configRows(cfg: AgentTargetConfig): string {
    const extOptions = (selected: FileExtensionFormat) => {
      const opts: { value: FileExtensionFormat; label: string }[] = [
        { value: 'md', label: '.md' },
        { value: 'mdc', label: '.mdc' },
        { value: 'instructions-md', label: '-instructions.md' },
        { value: 'prompt-md', label: '.prompt.md' },
      ];
      return opts.map((o) =>
        `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`
      ).join('');
    };

    const rows = CONTENT_TYPES.map((ct) => {
      const t = cfg.targets[ct] ?? defaultTarget();
      const isFlat = t.fileLayout === 'flat';
      const ext = t.fileExtension ?? 'md';
      return `<div class="ct-row">
        <div><input type="checkbox" class="en" data-id="${cfg.id}" data-ct="${ct}" ${t.enabled?'checked':''}/> <span class="ct-label">${ct}s</span></div>
        <div>
          <input type="text" class="pa" data-id="${cfg.id}" data-ct="${ct}" value="${h(t.path)}" placeholder="${PATH_HINTS[ct]}" />
          <div class="hint">${isFlat ? `→ folder/${slugExample(ct)}.md` : `→ folder/${slugExample(ct)}/SKILL.md`}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <select class="ext-sel" data-id="${cfg.id}" data-ct="${ct}" title="Output file extension">
            ${extOptions(ext)}
          </select>
          <div class="layout-toggle">
            <input type="radio" name="layout-${cfg.id}-${ct}" id="flat-${cfg.id}-${ct}" class="layout-flat" data-id="${cfg.id}" data-ct="${ct}" ${isFlat?'checked':''}/>
            <label for="flat-${cfg.id}-${ct}">Flat</label>
            <input type="radio" name="layout-${cfg.id}-${ct}" id="sub-${cfg.id}-${ct}" class="layout-sub" data-id="${cfg.id}" data-ct="${ct}" ${!isFlat?'checked':''}/>
            <label for="sub-${cfg.id}-${ct}">Subfolder</label>
          </div>
        </div>
      </div>`;
    }).join('');

    // Repo association section
    const repoSection = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--vscode-panel-border);">
        <strong style="font-size:0.9em;">Repo-Level Sync</strong>
        <p class="hint" style="margin:4px 0 8px;">Add repos where this agent's content should be synced.</p>
        <div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;">
          <div><label class="dim" style="font-size:0.8em;">Repo Name</label>
            <input type="text" class="repo-name" data-id="${cfg.id}" placeholder="e.g. my-frontend-app" style="width:160px" /></div>
          <div><label class="dim" style="font-size:0.8em;">Repo Path</label>
            <input type="text" class="repo-path" data-id="${cfg.id}" placeholder="C:\\projects\\my-app" style="width:240px" /></div>
          <button class="btn-secondary" data-act="addRepo" data-id="${cfg.id}">Add to Repo</button>
        </div>
        <div class="repo-list" data-id="${cfg.id}" style="margin-top:6px;"></div>
      </div>`;

    return `${rows}
      ${repoSection}
      <div class="st" data-id="${cfg.id}"></div>
      <div class="acts">
        <button class="btn-primary" data-act="save" data-id="${cfg.id}">Save &amp; Sync</button>
        <button class="btn-danger" data-act="remove" data-id="${cfg.id}">Remove</button>
      </div>`;
  }
}

interface Msg { type:string; config?:Partial<AgentTargetConfig>; id?:string; displayName?:string; extensionId?:string; agentId?:string; repoName?:string; repoPath?:string; }

function h(t: string): string {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function slugExample(ct: ItemType): string {
  return ct === 'skill' ? 'clean-code' : ct === 'rule' ? 'naming-rules' : 'pre-commit';
}

function defaultTarget(): TargetLocationConfig {
  return { enabled: false, path: '', fileLayout: 'flat', fileExtension: 'md' };
}

function defaultTargets(): Record<ItemType, TargetLocationConfig> {
  return {
    skill: defaultTarget(),
    rule: defaultTarget(),
    hook: defaultTarget(),
    workflow: defaultTarget(),
    agent: defaultTarget(),
  };
}

function buildTargets(raw?: Partial<Record<ItemType, Partial<TargetLocationConfig>>>): Record<ItemType, TargetLocationConfig> {
  const r = defaultTargets();
  if (!raw) return r;
  for (const ct of ['skill', 'rule', 'hook', 'workflow', 'agent'] as ItemType[]) {
    const s = raw[ct];
    if (s) r[ct] = {
      enabled: s.enabled ?? false,
      path: s.path ?? '',
      fileLayout: (s.fileLayout as FileLayout) ?? 'flat',
      fileExtension: (s.fileExtension as FileExtensionFormat) ?? 'md',
    };
  }
  return r;
}
