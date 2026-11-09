/* Consistent application dialogs. Browser permission/file-picker prompts stay native. */
'use strict';
(function (root) {
  let element, activeResolve;

  // Creates the shared dialog once and reuses its backdrop on later calls.
  function ensure() {
    if (element) return element;
    element = document.createElement('div');
    element.className = 'ng-dialog-backdrop';
    element.hidden = true;
    element.innerHTML = `<div class="ng-dialog" role="dialog" aria-modal="true" aria-labelledby="ng-dialog-title" aria-describedby="ng-dialog-desc"><div class="ng-dialog-heading"><span id="ng-dialog-title"></span><button type="button" class="ng-dialog-close" aria-label="${NGI18n.t('message_box.close')}">×</button></div><p id="ng-dialog-desc"></p><div class="ng-dialog-actions"><button class="ng-dialog-cancel" type="button">${NGI18n.t('message_box.cancel')}</button><button class="ng-dialog-confirm" type="button">${NGI18n.t('message_box.ok')}</button></div></div>`;
    document.body.append(element);
    return element;
  }

  // Replaces any active dialog and returns a promise for the new approval result.
  function open(opts) {
    const ui = ensure(),
      previous = document.activeElement;
    if (!ui.hidden && activeResolve) activeResolve(false);
    ui.querySelector('#ng-dialog-title').textContent =
      opts.title || NGI18n.t('message_box.message');
    ui.querySelector('#ng-dialog-desc').textContent = String(opts.message || '');
    const confirm = ui.querySelector('.ng-dialog-confirm'),
      cancel = ui.querySelector('.ng-dialog-cancel');
    confirm.textContent = opts.confirmLabel || NGI18n.t('message_box.ok');
    cancel.hidden = opts.cancelLabel === false;
    cancel.textContent = opts.cancelLabel || NGI18n.t('message_box.cancel');
    ui.hidden = false;
    document.body.classList.add('ng-dialog-active');
    return new Promise(resolve => {
      // Clears dialog handlers, restores connected focus, and settles the approval promise.
      const finish = approved => {
        ui.hidden = true;
        document.body.classList.remove('ng-dialog-active');
        confirm.onclick = cancel.onclick = null;
        ui.querySelector('.ng-dialog-close').onclick = null;
        ui.onkeydown = null;
        ui.onclick = null;
        activeResolve = null;
        if (previous?.isConnected) previous.focus?.({ preventScroll: true });
        resolve(approved);
      };
      activeResolve = finish;
      confirm.onclick = () => {
        /* Critical: start picker synchronously INSIDE this user click. */
        try {
          const result = opts.onConfirm?.();
          if (result && typeof result.catch === 'function')
            result.catch(err => api.alert(err?.message || String(err)));
        } catch (err) {
          // Close this dialog before opening its error replacement.
          finish(false);
          api.alert(err?.message || String(err));
          return;
        }
        finish(true);
      };
      cancel.onclick = () => finish(false);
      ui.querySelector('.ng-dialog-close').onclick = () => finish(false);
      ui.onclick = e => {
        if (e.target === ui) finish(false);
      };

      // Keeps Tab focus within enabled buttons and treats Escape as cancellation.
      ui.onkeydown = e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
        if (e.key === 'Tab') {
          const b = [...ui.querySelectorAll('button:not([hidden]):not([disabled])')];
          if (!b.length) return;
          const first = b[0],
            last = b[b.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      confirm.focus({ preventScroll: true });
    });
  }
  const api = {
    // Hides the cancel action while retaining close-button, backdrop, and Escape dismissal.
    alert(message, title = NGI18n.t('message_box.notice')) {
      return open({ title, message, cancelLabel: false });
    },

    // Resolves true on confirmation and false when the dialog is cancelled or dismissed.
    confirm(message, title = NGI18n.t('message_box.confirm')) {
      return open({ title, message, confirmLabel: NGI18n.t('message_box.confirm') });
    },

    // Invokes onConfirm in the confirming click without awaiting its asynchronous result.
    action(options) {
      return open(options);
    }
  };
  root.NGDialog = api;
})(globalThis);
