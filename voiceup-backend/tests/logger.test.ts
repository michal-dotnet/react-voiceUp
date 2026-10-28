import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  const logger = createLogger(level, (line) => lines.push(line));
  return { lines, logger };
}

describe('createLogger', () => {
  it('writes JSON lines with level, message and fields', () => {
    const { lines, logger } = capture('info');

    logger.info('hello', { requestId: 'abc' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      level: 'info',
      message: 'hello',
      requestId: 'abc',
    });
  });

  it('drops messages below the configured level', () => {
    const { lines, logger } = capture('warn');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toHaveLength(2);
  });

  it('writes nothing when silent', () => {
    const { lines, logger } = capture('silent');

    logger.error('e');

    expect(lines).toHaveLength(0);
  });
});
