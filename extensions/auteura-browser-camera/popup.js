(function () {
  'use strict';

  const statusElement = document.getElementById('status');
  const registeredScriptsElement = document.getElementById('registered-scripts');
  const modeInputs = Array.from(
    document.querySelectorAll('input[name="meet-mode"]'),
  );

  function setStatus(message) {
    if (statusElement !== null) {
      statusElement.textContent = message;
    }
  }

  function syncSelection(mode) {
    modeInputs.forEach((input) => {
      input.checked = input.value === mode;
    });
  }

  function setRegisteredScripts(scriptIds) {
    if (registeredScriptsElement === null) {
      return;
    }

    registeredScriptsElement.textContent =
      scriptIds.length === 0 ? 'none' : scriptIds.join(', ');
  }

  function requestMode(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  async function loadMode() {
    try {
      const response = await requestMode({ type: 'GET_MEET_INTEGRATION_MODE' });
      const mode = response?.mode === 'bridge-only' ? 'bridge-only' : 'full';
      syncSelection(mode);
      setStatus(`Current mode: ${mode}`);
      setRegisteredScripts(Array.isArray(response?.registeredScriptIds) ? response.registeredScriptIds : []);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Unable to read the current extension mode.',
      );
    }
  }

  modeInputs.forEach((input) => {
    input.addEventListener('change', async () => {
      if (input.checked === false) {
        return;
      }

      setStatus('Updating content scripts...');

      try {
        const response = await requestMode({
          mode: input.value,
          type: 'SET_MEET_INTEGRATION_MODE',
        });
        const mode = response?.mode === 'bridge-only' ? 'bridge-only' : 'full';
        syncSelection(mode);
        setRegisteredScripts(Array.isArray(response?.registeredScriptIds) ? response.registeredScriptIds : []);
        setStatus(`Mode updated to ${mode}. Refresh Meet tabs to apply it.`);
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : 'Unable to update the extension mode.',
        );
      }
    });
  });

  void loadMode();
})();
