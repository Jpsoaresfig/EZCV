document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'puesto') {
    /* Alterna uma classe em vez de escrever em element.style: mantém a
       decisão visual no CSS, onde está o resto do design. */
    var field = document.getElementById('otro-puesto-field');
    if (field) field.classList.toggle('is-hidden', e.target.value !== 'otro');
  }
  if (e.target && e.target.matches('input[type=file]')) {
    var field = e.target.closest('.field');
    var out = field && field.querySelector('[data-file-name]');
    if (out) {
      var f = e.target.files && e.target.files[0];
      out.textContent = f ? '✓ ' + f.name : '';
      out.classList.toggle('is-shown', Boolean(f));
    }
    /* Botão próprio (.file-pick): o texto nativo do input vem na língua do
       browser e não pode ser traduzido, por isso o input fica escondido. */
    var pick = e.target.closest('.file-pick');
    if (pick) {
      var has = Boolean(e.target.files && e.target.files[0]);
      pick.classList.toggle('has-file', has);
      var action = pick.querySelector('[data-file-action]');
      if (action) action.textContent = action.getAttribute(has ? 'data-change' : 'data-empty');
    }
  }
});

document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-copy]');
  if (!btn) return;
  var text = btn.getAttribute('data-copy');
  var done = function () {
    var old = btn.textContent;
    btn.textContent = { en: 'Copied!', pt: 'Copiado!' }[document.documentElement.lang] || '¡Copiado!';
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignora */ }
    document.body.removeChild(ta);
    done();
  }
});

/* Recuperação de senha: o token vem no fragmento (#t=…), que o browser não
   envia ao servidor. Copia-o para o formulário e limpa-o da barra de
   endereço (não fica no histórico). */
(function () {
  var input = document.querySelector('[data-reset-token]');
  if (!input) return;
  var m = /(?:^#|&)t=([a-f0-9]{64})/.exec(window.location.hash || '');
  if (m) {
    input.value = m[1];
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
})();

/* Botão «Imprimir» da página do QR — sem onclick inline por causa do CSP. */
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-print]')) window.print();
});

/* Guia de primeiros passos: «Abrir página» abre noutro separador. Ao voltar
   a este, recarrega para o passo aparecer como concluído. */
(function () {
  var opened = false;
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-refresh-on-return]')) opened = true;
  });
  document.addEventListener('visibilitychange', function () {
    if (opened && document.visibilityState === 'visible') window.location.reload();
  });
})();

/* Vídeo da página de apresentação (/conoce): a capa é um botão por cima do
   <video preload="none">. Nada é descarregado até a pessoa carregar no play
   — importante para quem abre a página com dados móveis. */
document.addEventListener('click', function (e) {
  var cover = e.target.closest('[data-video-play]');
  if (!cover) return;
  var box = cover.closest('[data-video]');
  var video = box && box.querySelector('video');
  if (!video) return;
  box.classList.add('is-playing');
  var p = video.play();
  if (p && p.catch) p.catch(function () { /* o utilizador usa os controlos */ });
  video.focus();
});
