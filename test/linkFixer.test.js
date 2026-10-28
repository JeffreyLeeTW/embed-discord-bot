import { expect } from 'chai';
import { describe, it } from 'mocha';
import { fixEmbedUrl, getFixedEmbedUrls } from '../src/linkFixer.js';

describe('linkFixer', () => {
  it('should convert X links to fixvx links and remove tracking params', () => {
    const fixedUrl = fixEmbedUrl(
      'https://x.com/example/status/123?utm_source=share&utm_medium=discord&lang=zh',
    );

    expect(fixedUrl).to.equal(
      'https://www.fixvx.com/example/status/123?lang=zh',
    );
  });

  it('should convert Twitter links to fixvx links', () => {
    const fixedUrl = fixEmbedUrl('https://twitter.com/example/status/123');

    expect(fixedUrl).to.equal('https://www.fixvx.com/example/status/123');
  });

  it('should convert Instagram links to kkinstagram links', () => {
    const fixedUrl = fixEmbedUrl(
      'https://www.instagram.com/reel/ABC/?igshid=tracking',
    );

    expect(fixedUrl).to.equal('https://www.kkinstagram.com/reel/ABC/');
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
      'https://www.facebed.com/story.php?story_fbid=123&id=456',
    );
  });

  it('should handle mobile and alternate web subdomains', () => {
    expect(fixEmbedUrl('https://mobile.x.com/u/status/1')).to.equal(
      'https://www.fixvx.com/u/status/1',
    );
    expect(fixEmbedUrl('https://mobile.twitter.com/u/status/1')).to.equal(
      'https://www.fixvx.com/u/status/1',
    );
    expect(fixEmbedUrl('https://web.facebook.com/watch/?v=123')).to.equal(
      'https://www.facebed.com/watch/?v=123',
    );
  });

  it('should handle Facebook and Instagram short domains', () => {
    expect(fixEmbedUrl('https://fb.com/watch/?v=123')).to.equal(
      'https://www.facebed.com/watch/?v=123',
    );
    expect(fixEmbedUrl('https://instagr.am/p/ABC/')).to.equal(
      'https://www.kkinstagram.com/p/ABC/',
    );
  });

  it('should collect unique fixed urls from message content', () => {
    const fixedUrls = getFixedEmbedUrls(
      '看這個 https://x.com/u/status/1?utm_source=a 還有 https://instagram.com/p/ABC/. https://x.com/u/status/1?utm_source=a',
    );

    expect(fixedUrls).to.deep.equal([
      'https://www.fixvx.com/u/status/1',
      'https://www.kkinstagram.com/p/ABC/',
    ]);
  });

  it('should ignore unsupported urls', () => {
    expect(fixEmbedUrl('https://example.com/post/123?utm_source=a')).to.equal(
      null,
    );
  });
});
