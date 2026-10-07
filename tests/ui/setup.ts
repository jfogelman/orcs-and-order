// The page itself, as text. Imported rather than read off disk because this
// project does not install `@types/node` -- and because going through Vite is
// the same path the browser takes, so the fixture is the served page by
// construction.
import pageHtml from '../../index.html?raw';

/**
 * Enough browser for the interface to run in, and no more.
 *
 * Everything in `src/ui/` and `src/main.ts` was unreachable from the suite:
 * tests run in node, so a rule that lived in the interface was only ever
 * verified by somebody clicking it. Two bugs reached a real game that way in
 * one week -- a unit that could not be told to hold the city it had just walked
 * into, and a ruin that asked whether you wanted to risk it *after* you had
 * already opened it.
 *
 * This file runs for every test file. In the node environment it does nothing
 * at all, so the thousand simulation tests are not slowed down by it; a test
 * that wants a browser says so with `// @vitest-environment jsdom` at the top,
 * and gets the real page shell and a canvas that accepts calls.
 */

/** The page as it is actually served, so the fixture cannot drift from it. */
function pageShell(): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(pageHtml);
  if (!body) throw new Error('index.html has no body to borrow');
  // The module script is dropped: the test imports `main.ts` itself, when it
  // wants to and after the document is ready for it.
  return body[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

/**
 * A 2D context that records nothing and refuses nothing.
 *
 * jsdom has no canvas, and the alternative is the `canvas` package, which is a
 * native build. Nothing here is testing what the map *looks* like -- that is
 * what eyes are for -- so a context that accepts every call and returns plausible
 * values is the whole requirement.
 */
function stubCanvas(): void {
  /**
   * Every call the renderer makes, in order.
   *
   * There are no pixels to look at, so this is the only honest question a test
   * can ask of the drawing: *what did it ask the canvas to do?* It is enough to
   * tell a woken ruin's glow from an undisturbed one's absence of a glow, which
   * is a fact about behaviour rather than about taste.
   */
  const calls: string[] = [];
  (globalThis as unknown as Record<string, unknown>).canvasCalls = {
    seen: () => calls.slice(),
    clear: () => {
      calls.length = 0;
    },
  };
  const noop = () => undefined;
  const record = (name: string, result?: unknown) => (...args: unknown[]) => {
    void args;
    calls.push(name);
    return result;
  };
  const ctx = new Proxy(
    {
      canvas: null,
      measureText: () => ({ width: 10 }),
      createLinearGradient: record('createLinearGradient', { addColorStop: noop }),
      createRadialGradient: record('createRadialGradient', { addColorStop: noop }),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      save: noop,
      restore: noop,
    } as Record<string, unknown>,
    {
      get: (target, prop) => {
        if (prop in target) return target[prop as string];
        // Anything else the renderer reaches for: a function that records that
        // it happened and does nothing, and a writable property for the dozens
        // of `ctx.fillStyle = ...` lines.
        return typeof prop === 'string' && /^[a-z]/.test(prop) ? record(prop) : undefined;
      },
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:,') as never;
  // The renderer builds shapes with `Path2D`, which jsdom does not have either.
  // Same bargain as the context: it has to exist and accept calls.
  if (!('Path2D' in globalThis)) {
    (globalThis as unknown as Record<string, unknown>).Path2D = class {
      addPath(): void {}
      moveTo(): void {}
      lineTo(): void {}
      arc(): void {}
      rect(): void {}
      closePath(): void {}
      quadraticCurveTo(): void {}
      bezierCurveTo(): void {}
      ellipse(): void {}
    };
  }
}

if (typeof document !== 'undefined') {
  document.body.innerHTML = pageShell();
  stubCanvas();
  // Images never load in jsdom. The sprite cache already handles that -- it
  // falls back to its procedural placeholders -- but it should fail quietly
  // rather than leaving unhandled rejections across the run.
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    // Deliberately never called back. A test drives the game by calling into
    // it; a render loop ticking in the background only adds noise.
    void cb;
    return 0;
  }) as never;
  window.cancelAnimationFrame = (() => undefined) as never;
  // jsdom has `MutationObserver` and not `ResizeObserver`, and the topbar
  // folds itself with both. Nothing here is testing the fold -- there is no
  // layout to fold against -- so it is enough that the constructor exists and
  // the callback never fires.
  if (!('ResizeObserver' in window)) {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
}
