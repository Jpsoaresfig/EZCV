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
  }
});

document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-copy]');
  if (!btn) return;
  var text = btn.getAttribute('data-copy');
  var done = function () {
    var old = btn.textContent;
    btn.textContent = '¡Copiado!';
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
