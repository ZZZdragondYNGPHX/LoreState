// The management shell owns its light palette; user-authored HTML stays independent.
export const CONTROL_CENTER_CSS = `
#lorestate-state-manager{--ls-bg:#fafaf7;--ls-surface:#f0f3f0;--ls-card:#fff;--ls-soft:#e4efea;--ls-line:#d4ddd7;--ls-muted:#53645b;--ls-accent:#23664f;--ls-warn:#a13d2e;box-sizing:border-box;width:min(1160px,calc(100vw - 24px));height:min(840px,calc(100dvh - 32px));max-width:none;max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--ls-line);border-radius:18px;background:var(--ls-bg);color:#23352d;font:15px/1.6 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;text-shadow:none;overflow:hidden;color-scheme:light;box-shadow:0 24px 80px #172e2529}
#lorestate-state-manager[open]{display:flex;flex-direction:column}
#lorestate-state-manager::backdrop,#lorestate-state-manager .ls-style-dialog::backdrop{background:#172e2570}
#lorestate-state-manager *{box-sizing:border-box;min-width:0;text-shadow:none;font-family:inherit}
#lorestate-state-manager [hidden]{display:none!important}
#lorestate-state-manager :is(h2,h3,h4,p){margin:0 0 12px;color:inherit;overflow-wrap:anywhere}
#lorestate-state-manager h2{font-size:22px;letter-spacing:-.04em;margin:0;font-weight:750}
#lorestate-state-manager h3{font-size:22px;font-weight:650;letter-spacing:-.02em}
#lorestate-state-manager h4{font-size:13px;color:var(--ls-muted);margin:16px 0 4px}
#lorestate-state-manager .ls-top{flex:0 0 auto;background:var(--ls-card);border-bottom:1px solid var(--ls-line)}
#lorestate-state-manager .ls-header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;gap:16px}
#lorestate-state-manager .ls-header p{font-size:12px;color:var(--ls-muted);margin:0}
#lorestate-state-manager .ls-layout{flex:1;min-height:0;container-type:inline-size}
#lorestate-state-manager .ls-workspace{display:grid;grid-template-columns:188px minmax(0,1fr);height:100%}
#lorestate-state-manager .ls-tabs{display:flex;flex-direction:column;gap:6px;padding:20px 12px;background:var(--ls-surface);border-right:1px solid var(--ls-line);overflow:auto}
#lorestate-state-manager .ls-tabs button{display:flex;flex-direction:column;align-items:flex-start;flex:0 0 auto;min-height:66px;padding:10px 14px;border:1px solid transparent;background:transparent;text-align:left;color:var(--ls-muted);font-size:14px}
#lorestate-state-manager .ls-tabs button small{font-size:11px;font-weight:400;margin-top:3px;color:var(--ls-muted)}
#lorestate-state-manager .ls-tabs button[aria-selected=true]{background:var(--ls-card);color:var(--ls-accent);border-color:var(--ls-line);box-shadow:0 2px 5px #23352d08;font-weight:700}
#lorestate-state-manager .ls-content{overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-bottom:4px}
#lorestate-state-manager button{font:inherit;line-height:1.4;min-height:44px;max-width:100%;margin:0;padding:10px 14px;border:1px solid var(--ls-line);border-radius:8px;background:var(--ls-card);color:inherit;cursor:pointer;overflow-wrap:anywhere;box-shadow:none}
#lorestate-state-manager button:hover{background:var(--ls-soft);border-color:#9ab5a6}
#lorestate-state-manager button:disabled{opacity:.5;cursor:default}
#lorestate-state-manager .ls-primary{background:var(--ls-accent);color:#fff;border-color:var(--ls-accent);font-weight:600}
#lorestate-state-manager .ls-primary:hover{background:#194d3b;color:#fff}
#lorestate-state-manager .ls-danger{color:var(--ls-warn);border-color:#e4c9c1}
#lorestate-state-manager :is(button,select,input,textarea,summary,[role=tabpanel]):focus-visible{outline:2px solid var(--ls-accent);outline-offset:3px}
#lorestate-state-manager .ls-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:18px 24px;border-bottom:1px solid var(--ls-line);background:var(--ls-card)}
#lorestate-state-manager .ls-toolbar label{display:flex;flex-shrink:0;gap:10px;align-items:center;margin:0 auto 0 0;white-space:nowrap}
#lorestate-state-manager .ls-body{padding:24px}
#lorestate-state-manager .ls-page-header{margin-bottom:22px}
#lorestate-state-manager .ls-page-header h3{margin-bottom:4px}
#lorestate-state-manager .ls-page-header p{color:var(--ls-muted);font-size:13px;margin:0}
#lorestate-state-manager .ls-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
#lorestate-state-manager :is(select,input,textarea){font:inherit;width:100%;max-width:100%;min-height:44px;border:1px solid #b5c3bb;border-radius:7px;background:#fff;color:#23352d;padding:10px;box-shadow:none}
#lorestate-state-manager select{width:auto}
#lorestate-state-manager label{display:block;margin:14px 0 6px;color:var(--ls-muted);font-size:13px}
#lorestate-state-manager label :is(select,textarea,input){display:block;width:100%;margin-top:6px;font-size:15px}
#lorestate-state-manager .ls-check{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;margin:8px 0 0;padding:8px 12px;border:1px solid var(--ls-line);border-radius:8px;background:var(--ls-card);color:#23352d;font-size:14px;cursor:pointer}
#lorestate-state-manager label input[type=checkbox]{flex:0 0 auto;display:inline-block;width:22px;height:22px;min-height:22px;padding:0;margin:0 0 0 12px;-webkit-appearance:checkbox;appearance:auto;background:initial;border:initial;border-radius:initial;box-shadow:none;accent-color:var(--ls-accent);cursor:pointer;touch-action:manipulation}
#lorestate-state-manager label input[type=checkbox]::before{content:none!important}
#lorestate-state-manager .ls-card{margin:0 0 16px;padding:0;border:1px solid var(--ls-line);border-radius:10px;background:var(--ls-card);overflow:hidden}
#lorestate-state-manager .ls-card>summary{display:block;min-height:48px;padding:16px 18px;cursor:pointer;list-style:none}
#lorestate-state-manager .ls-card>summary::-webkit-details-marker{display:none}
#lorestate-state-manager .ls-card>summary:hover{background:#f4f7f4}
#lorestate-state-manager .ls-card[open]>summary{border-bottom:1px solid var(--ls-line)}
#lorestate-state-manager .ls-card-row{display:flex;align-items:center;gap:10px}
#lorestate-state-manager .ls-step{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:var(--ls-soft);color:var(--ls-accent);font-size:12px;font-weight:700}
#lorestate-state-manager .ls-card-title{font-size:15px;font-weight:650}
#lorestate-state-manager .ls-chevron{margin-left:auto;color:var(--ls-muted);font-size:13px;transition:transform .15s ease}
#lorestate-state-manager .ls-card[open]>.ls-card-row .ls-chevron,#lorestate-state-manager .ls-card[open]>summary .ls-chevron{transform:rotate(180deg)}
#lorestate-state-manager .ls-hint{display:block;margin-top:5px;color:var(--ls-muted);font-size:12px;line-height:1.6;font-weight:400}
#lorestate-state-manager .ls-card-body{padding:4px 18px 18px}
#lorestate-state-manager .ls-note{margin:12px 0 0;color:var(--ls-muted);font-size:13px}
#lorestate-state-manager .ls-subhead{margin:20px 0 0;padding-bottom:6px;border-bottom:1px solid var(--ls-line);color:var(--ls-muted);font-size:12px}
#lorestate-state-manager .ls-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:0 18px}
#lorestate-state-manager .ls-health{margin:0 0 18px;padding:12px 16px;border-left:3px solid var(--ls-accent);border-radius:6px;background:var(--ls-soft);font-size:13px;white-space:pre-wrap}
#lorestate-state-manager .ls-health:empty{display:none}
#lorestate-state-manager .ls-health[data-error=true]{border-color:var(--ls-warn);background:#fff0e9;color:#773323}
#lorestate-state-manager textarea{display:block;min-height:140px;resize:vertical;font:13px/1.7 ui-monospace,monospace;margin:6px 0 0}
#lorestate-state-manager details:not(.ls-card){margin:16px 0 0;padding:12px 0 0;border-top:1px solid var(--ls-line)}
#lorestate-state-manager summary{cursor:pointer;font-weight:600;min-height:44px}
#lorestate-state-manager pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
#lorestate-state-manager .ls-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:16px;margin:16px 0}
#lorestate-state-manager dt{font-size:12px;color:var(--ls-muted)}#lorestate-state-manager dd{margin:4px 0 0;overflow-wrap:anywhere}
#lorestate-state-manager .ls-appearance{container-type:inline-size}
#lorestate-state-manager .ls-appearance-work{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;margin:20px 0}
#lorestate-state-manager .ls-appearance-preview{padding:16px;border:1px solid var(--ls-line);border-radius:10px;background:var(--ls-card)}
#lorestate-state-manager .ls-appearance-code textarea{font:13px/1.6 ui-monospace,monospace;tab-size:2;min-height:320px;resize:vertical}
#lorestate-state-manager .ls-appearance-frame{margin-top:16px}
#lorestate-state-manager .ls-style-dialog{position:fixed;inset:0;margin:auto;width:min(680px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--ls-line);border-radius:14px;background:var(--ls-bg);color:#23352d;font:inherit;overflow:auto;color-scheme:light}
#lorestate-state-manager .ls-style-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px;border-bottom:1px solid var(--ls-line)}
#lorestate-state-manager .ls-style-head h3{margin:0;font-size:18px}
#lorestate-state-manager .ls-style-body{padding:18px}
#lorestate-state-manager .ls-style-footer{position:sticky;bottom:0;background:var(--ls-bg);padding:12px 18px;margin:0;border-top:1px solid var(--ls-line)}
@container(min-width:700px){#lorestate-state-manager .ls-appearance-work{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
@container(max-width:720px){#lorestate-state-manager .ls-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}#lorestate-state-manager .ls-tabs{flex-direction:row;gap:4px;padding:8px 12px;border-right:0;border-bottom:1px solid var(--ls-line)}#lorestate-state-manager .ls-tabs button{align-items:center;min-height:44px;white-space:nowrap;padding:10px 12px}#lorestate-state-manager .ls-tabs button small{display:none}#lorestate-state-manager .ls-toolbar{padding:14px}#lorestate-state-manager .ls-body{padding:18px 14px}#lorestate-state-manager .ls-toolbar label{width:100%;margin-right:0}#lorestate-state-manager .ls-toolbar select{flex:1}#lorestate-state-manager .ls-actions button{flex:1 1 140px}}
@media(max-width:520px){#lorestate-state-manager .ls-header{padding:12px 16px}#lorestate-state-manager h3{font-size:20px}}
@media(prefers-reduced-motion:reduce){#lorestate-state-manager .ls-chevron{transition:none}#lorestate-state-manager *{scroll-behavior:auto}}
`;
