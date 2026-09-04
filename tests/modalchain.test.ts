import { beforeEach, describe, expect, it } from 'vitest';
import { afterModalCloses, closeModal, isModalOpen, openModal } from '../src/ui/dom';

/**
 * Enough of a document for `openModal` to run in.
 *
 * Deliberately not jsdom: the thing under test is *when* callbacks fire, not
 * how HTML parses, and a twenty-line stub keeps the project's dependency list
 * where it is. Nothing here reads `innerHTML` back, so it is a plain field.
 */
function fakeNode(): any {
  return {
    className: '',
    innerHTML: '',
    children: [] as any[],
    appendChild(child: any) { this.children.push(child); },
    remove() {},
    querySelector: () => null,
    querySelectorAll: () => [] as any[],
    addEventListener: () => {},
  };
}

function stubDom(): void {
  const root = fakeNode();
  (globalThis as any).document = {
    getElementById: (id: string) => (id === 'modal-root' ? root : null),
    createElement: () => fakeNode(),
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

/** Open a modal and hand back its own close function. */
function openAndCapture(title = 'Question'): () => void {
  let close = () => {};
  openModal({ title, body: '', onMount: (_root, c) => { close = c; } });
  return close;
}

/**
 * The end of a turn asks its questions in a chain: each one waits for the
 * previous modal to close. The perk menu answers with `onPick(id); close()`,
 * and the queue used to be drained *inside* close -- so the next question was
 * asked before the click handler had finished recording the answer.
 *
 * A unit built in a barracks arrives already promoted, so it is asked what it
 * has learned the moment the turn ends. Answering re-asked the same question,
 * which is the "I have to click the option twice" this comes from; picking
 * twice also quietly banked two perks for one rank.
 */
describe('questions that wait for the modal in front of them', () => {
  beforeEach(() => {
    stubDom();
    // Nothing carries over between tests, including a modal left standing.
    if (isModalOpen()) closeModal();
  });

  it('does not run the next question inside the click that answered this one', async () => {
    const order: string[] = [];
    const close = openAndCapture();
    afterModalCloses(() => order.push('next question'));

    // What a button does: record the answer, dismiss the menu, and the handler
    // keeps running for a moment afterwards.
    close();
    order.push('answer recorded');

    await Promise.resolve();
    expect(order).toEqual(['answer recorded', 'next question']);
  });

  it('sees the answer, rather than the state as it was mid-click', async () => {
    let answered = false;
    let sawAnswer: boolean | null = null;
    const close = openAndCapture();
    afterModalCloses(() => { sawAnswer = answered; });

    close();
    answered = true;

    await Promise.resolve();
    // False here is the bug: the next question was asked about a unit that had
    // already chosen, found it still owed a perk, and asked again.
    expect(sawAnswer).toBe(true);
  });

  it('lets an answer open the follow-up question itself', async () => {
    const asked: string[] = [];
    const close = openAndCapture('first perk');
    // A unit owed two perks queues the second ask while the first is still up.
    afterModalCloses(() => {
      asked.push('second perk');
      openAndCapture('second perk');
    });

    close();
    await Promise.resolve();

    expect(asked).toEqual(['second perk']);
    expect(isModalOpen()).toBe(true);
  });

  it('runs each waiting question once', async () => {
    let runs = 0;
    const close = openAndCapture();
    afterModalCloses(() => { runs += 1; });

    close();
    await Promise.resolve();
    await Promise.resolve();

    expect(runs).toBe(1);
  });

  it('does not fire the chain when one modal merely replaces another', async () => {
    let fired = false;
    openAndCapture('first');
    afterModalCloses(() => { fired = true; });

    // Opening over the top is a replacement, not an answer.
    const second = openAndCapture('second');
    await Promise.resolve();
    expect(fired).toBe(false);

    second();
    await Promise.resolve();
    expect(fired).toBe(true);
  });
});
