import { expect } from 'chai';
import { describe, it } from 'mocha';
import { fixEmbedUrl, getFixedEmbedUrls } from '../src/linkFixer.js';

describe('linkFixer', () => {
  it('should convert X links to fixvx links and remove tracking params', () => {
    const fixedUrl = fixEmbedUrl(
      'https://x.com/example/status/123?utm_source=share&utm_medium=discord&lang=zh',
    );

    expect(fixedUrl).to.equal('https://fixvx.com/example/status/123?lang=zh');
  });

  it('should convert Twitter links to fixvx links', () => {
    const fixedUrl = fixEmbedUrl('https://twitter.com/example/status/123');

    expect(fixedUrl).to.equal('https://fixvx.com/example/status/123');
  });

  it('should convert Instagram links to ddinstagram links', () => {
    const fixedUrl = fixEmbedUrl(
      'https://www.instagram.com/reel/ABC/?igshid=tracking',
    );

    expect(fixedUrl).to.equal('https://ddinstagram.com/reel/ABC/');
  });

  it('should convert Threads links to fixthreads.seria.moe links', () => {
    const fixedUrl = fixEmbedUrl(
      'https://www.threads.net/@user/post/ABC?utm_campaign=shared',
    );

    expect(fixedUrl).to.equal('https://fixthreads.seria.moe/@user/post/ABC');
  });

  it('should convert Facebook links to facebed links and preserve post params', () => {
    const fixedUrl = fixEmbedUrl(
      'https://m.facebook.com/story.php?story_fbid=123&id=456&fbclid=tracking',
    );

    expect(fixedUrl).to.equal(
      'https://facebed.com/story.php?story_fbid=123&id=456',
    );
  });

  it('should collect unique fixed urls from message content', () => {
    const fixedUrls = getFixedEmbedUrls(
      '看這個 https://x.com/u/status/1?utm_source=a 還有 https://instagram.com/p/ABC/. https://x.com/u/status/1?utm_source=a',
    );

    expect(fixedUrls).to.deep.equal([
      'https://fixvx.com/u/status/1',
      'https://ddinstagram.com/p/ABC/',
    ]);
  });

  it('should ignore unsupported urls', () => {
    expect(fixEmbedUrl('https://example.com/post/123?utm_source=a')).to.equal(
      null,
    );
  });
});
