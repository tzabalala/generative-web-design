import { buildDesignMessages, buildRefineMessages } from '../src/promptEngineering.js';

describe('buildDesignMessages', () => {
  it('forces Greek output for a Greek request, but keeps searchText verbatim', () => {
    const [user] = buildDesignMessages('<h1>x</h1>', 'body{}', 'σελίδα για θερινό κινηματογράφο');
    expect(user.content).toContain('in Greek');
    expect(user.content).toContain('searchText');
  });

  it('follows the request language for non-Greek requests', () => {
    const [user] = buildDesignMessages('<h1>x</h1>', 'body{}', 'a page for a bakery');
    expect(user.content).not.toContain('in Greek');
    expect(user.content).toContain('same language as the request');
  });

  it('ends with the "{" prefill so the answer is parseable JSON', () => {
    const messages = buildDesignMessages('<h1>x</h1>', 'body{}', 'a page');
    expect(messages[messages.length - 1]).toEqual({ role: 'assistant', content: '{' });
  });
});

describe('buildRefineMessages', () => {
  it('sends the current code as context so the change is targeted', () => {
    const [user] = buildRefineMessages('<h1>Old</h1>', 'h1{color:red}', 'make it blue');
    expect(user.content).toContain('<h1>Old</h1>');
    expect(user.content).toContain('make it blue');
  });
});
