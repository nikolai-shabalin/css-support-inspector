import { css } from '@codemirror/lang-css';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { analyzeCssSupport } from './analyzer';

const SAMPLE_CSS = `/* Вставьте ваш CSS-код сюда */`;

export function mountSupportAnalyzer() {
  const editorHost = document.querySelector<HTMLDivElement>('#editor');
  if (!editorHost) {
    return;
  }

  const statusEl = document.querySelector<HTMLParagraphElement>('#status');
  const clearButton = document.querySelector<HTMLButtonElement>('#clear-editor');
  const featureList = document.querySelector<HTMLUListElement>('#feature-list');
  const chromeVersion = document.querySelector<HTMLParagraphElement>('#version-chrome');
  const chromeLatest = document.querySelector<HTMLParagraphElement>('#latest-chrome');
  const chromeReason = document.querySelector<HTMLParagraphElement>('#reason-chrome');
  const firefoxVersion = document.querySelector<HTMLParagraphElement>('#version-firefox');
  const firefoxLatest = document.querySelector<HTMLParagraphElement>('#latest-firefox');
  const firefoxReason = document.querySelector<HTMLParagraphElement>('#reason-firefox');
  const safariVersion = document.querySelector<HTMLParagraphElement>('#version-safari');
  const safariLatest = document.querySelector<HTMLParagraphElement>('#latest-safari');
  const safariReason = document.querySelector<HTMLParagraphElement>('#reason-safari');

  if (
    !statusEl ||
    !featureList ||
    !chromeVersion ||
    !chromeLatest ||
    !chromeReason ||
    !firefoxVersion ||
    !firefoxLatest ||
    !firefoxReason ||
    !safariVersion ||
    !safariLatest ||
    !safariReason
  ) {
    return;
  }

  const state = EditorState.create({
    doc: SAMPLE_CSS,
    extensions: [lineNumbers(), css(), EditorView.lineWrapping]
  });

  const view = new EditorView({
    state,
    parent: editorHost,
    dispatch(tr) {
      view.update([tr]);
      if (tr.docChanged) {
        runAnalysis(view.state.doc.toString());
      }
    }
  });

  clearButton?.addEventListener('click', () => {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: ''
      }
    });
    view.focus();
  });

  view.focus();
  runAnalysis(SAMPLE_CSS);

  function runAnalysis(code: string) {
    try {
      const result = analyzeCssSupport(code);

      statusEl.classList.remove('error');
      statusEl.textContent = result.features.length
        ? `Проанализировано CSS-фич: ${result.features.length}`
        : 'Добавьте CSS-код для анализа';

      renderVersion(chromeVersion, result.minimumVersions.chrome, result.unsupported.chrome?.length ?? 0);
      renderVersion(firefoxVersion, result.minimumVersions.firefox, result.unsupported.firefox?.length ?? 0);
      renderVersion(safariVersion, result.minimumVersions.safari, result.unsupported.safari?.length ?? 0);
      chromeLatest.textContent = `Актуальная: ${result.latestVersions.chrome ?? 'n/a'}`;
      firefoxLatest.textContent = `Актуальная: ${result.latestVersions.firefox ?? 'n/a'}`;
      safariLatest.textContent = `Актуальная: ${result.latestVersions.safari ?? 'n/a'}`;
      chromeReason.textContent = result.reasons.chrome;
      firefoxReason.textContent = result.reasons.firefox;
      safariReason.textContent = result.reasons.safari;

      featureList.replaceChildren();
      result.features
        .slice(0, 200)
        .sort((a, b) => a.label.localeCompare(b.label))
        .forEach((feature) => {
          const item = document.createElement('li');
          item.textContent = feature.label;
          featureList.appendChild(item);
        });
    } catch (error) {
      statusEl.classList.add('error');
      statusEl.textContent = `Ошибка анализа: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`;
      [chromeVersion, firefoxVersion, safariVersion].forEach((el) => {
        el.textContent = '—';
        el.classList.add('unavailable');
      });
      [chromeLatest, firefoxLatest, safariLatest].forEach((el) => {
        el.textContent = 'Актуальная: n/a';
      });
      [chromeReason, firefoxReason, safariReason].forEach((el) => {
        el.textContent = 'Причина недоступна из-за ошибки анализа';
      });
    }
  }
}

function renderVersion(element: HTMLElement, version: string | null, unsupportedCount: number) {
  if (version === null) {
    element.textContent = unsupportedCount ? 'not fully supported' : 'n/a';
    element.classList.add('unavailable');
    return;
  }

  element.classList.remove('unavailable');
  element.textContent = version === 'all' ? 'all' : `>= ${version}`;
}
