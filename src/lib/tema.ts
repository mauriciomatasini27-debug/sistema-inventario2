// Tema claro/oscuro por dispositivo (DS-S4). El script inicial corre inline en el
// <head> antes de pintar para que no haya flash; el toggle solo persiste la
// elección del usuario y el resto del tiempo manda la preferencia del sistema.
export const CLAVE_TEMA = "tema";

export type Tema = "claro" | "oscuro";

export function resolverTema(guardado: string | null, prefiereOscuro: boolean): Tema {
  if (guardado === "claro" || guardado === "oscuro") return guardado;
  return prefiereOscuro ? "oscuro" : "claro";
}

export const SCRIPT_TEMA_INICIAL = `(function(){
  var raiz=document.documentElement;
  var guardado=null;
  try{guardado=localStorage.getItem("tema");}catch(e){guardado=null;}
  var oscuro=false;
  try{oscuro=matchMedia("(prefers-color-scheme: dark)").matches;}catch(e){oscuro=false;}
  var tema=(guardado==="claro"||guardado==="oscuro")?guardado:(oscuro?"oscuro":"claro");
  raiz.dataset.tema=tema;
  if(guardado!=="claro"&&guardado!=="oscuro"){
    var mq=matchMedia("(prefers-color-scheme: dark)");
    var sync=function(ev){
      var ahora=null;
      try{ahora=localStorage.getItem("tema");}catch(e){ahora=null;}
      if(ahora==="claro"||ahora==="oscuro")return;
      raiz.dataset.tema=ev.matches?"oscuro":"claro";
      var w=typeof window!=="undefined"?window:null;
      if(w&&w.__temaPintar)w.__temaPintar();
    };
    if(mq.addEventListener){mq.addEventListener("change",sync);}
    else if(mq.addListener){mq.addListener(sync);}
  }
})();`;

export const SCRIPT_TEMA_TOGGLE = `(function(){
  // Una sola instancia aunque la página tenga más de un toggle: si no, cada
  // copia del script suma su listener y un click alterna dos veces.
  var w=typeof window!=="undefined"?window:{};
  if(w.__temaPintar)return;
  function temaActual(){return document.documentElement.dataset.tema==="oscuro"?"oscuro":"claro";}
  // El botón dice a qué tema lleva: en claro "Oscuro" (☾), en oscuro "Claro" (☀).
  function pintar(){
    var oscuro=temaActual()==="oscuro";
    var botones=document.querySelectorAll("button[data-tema-toggle]");
    for(var i=0;i<botones.length;i++){
      var b=botones[i];
      b.setAttribute("aria-pressed",oscuro?"true":"false");
      if(b.getAttribute("role")==="switch"){
        b.setAttribute("aria-checked",oscuro?"true":"false");
      }
      b.setAttribute("aria-label",oscuro?"Tema oscuro, cambiar a claro":"Tema oscuro");
      if(b.querySelector){
        var icono=b.querySelector("[data-tema-icono]");
        var etiqueta=b.querySelector("[data-tema-etiqueta]");
        if(icono)icono.textContent=oscuro?"☀":"☾";
        if(etiqueta)etiqueta.textContent=oscuro?"Claro":"Oscuro";
      }
    }
  }
  function alternar(){
    var t=temaActual()==="oscuro"?"claro":"oscuro";
    document.documentElement.dataset.tema=t;
    try{localStorage.setItem("tema",t);}catch(e){console.warn("[tema] sin persistencia", e);}
    pintar();
  }
  w.__temaPintar=pintar;
  // Pintar ya: el script va después del botón, así no parpadea la etiqueta entre
  // el HTML servido y el DOMContentLoaded.
  pintar();
  function iniciar(){
    var botones=document.querySelectorAll("button[data-tema-toggle]");
    for(var i=0;i<botones.length;i++){botones[i].addEventListener("click",alternar);}
    pintar();
  }
  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",iniciar);}
  else{iniciar();}
})();`;
