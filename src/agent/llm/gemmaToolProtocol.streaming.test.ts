import { describe, expect, it } from 'vitest';
import { stripToolProtocol } from './gemmaToolProtocol';

describe('stripToolProtocol streaming safety', () => {
  it('hides incomplete thought blocks entirely until they are closed', () => {
    const partial = `<|channel>thought
I have successfully read the music.
I will summarize this for the user.`;

    expect(stripToolProtocol(partial)).toBe('');
  });

  it('reveals visible answer cleanly after a thought block closes', () => {
    const completed = `<|channel>thought
Internal reasoning here.
<channel|>Here is the sheet music I read.`;

    expect(stripToolProtocol(completed)).toBe('Here is the sheet music I read.');
  });
});
