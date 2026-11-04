import { expect } from 'chai';
import { describe, it, afterEach } from 'mocha';
import sinon from 'sinon';
import {
  countComponents,
  fetchThreadsComponent,
  isThreadsEmbedUrl,
  parseThreadsComponent,
} from '../src/threadsEmbed.js';
import { createThreadsHtml, THREADS_COMPONENT } from './threadsFixtures.js';

describe('threadsEmbed', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should recognize fixthreads URLs only', () => {
    expect(
      isThreadsEmbedUrl('https://fixthreads.seria.moe/@a/post/B'),
    ).to.equal(true);
    expect(isThreadsEmbedUrl('https://www.fixvx.com/a/status/1')).to.equal(
      false,
    );
    expect(isThreadsEmbedUrl('not a url')).to.equal(false);
  });

  it('should parse the component embed from fixthreads HTML', () => {
    expect(parseThreadsComponent(createThreadsHtml())).to.deep.equal(
      THREADS_COMPONENT,
    );
  });

  it('should return null when the component embed is missing or invalid', () => {
    expect(parseThreadsComponent('<html></html>')).to.equal(null);
    expect(
      parseThreadsComponent(
        '<script id="discord:component-embed" type="application/json">{oops</script>',
      ),
    ).to.equal(null);
    expect(parseThreadsComponent(createThreadsHtml({ type: 10 }))).to.equal(
      null,
    );
  });

  it('should count nested components and accessories', () => {
    expect(countComponents(THREADS_COMPONENT)).to.equal(6);
  });

  it('should fetch with a crawler user agent', async () => {
    const fetchStub = sinon
      .stub(globalThis, 'fetch')
      .resolves(new Response(createThreadsHtml()));

    const component = await fetchThreadsComponent(
      'https://fixthreads.seria.moe/@a/post/B',
    );

    expect(component).to.deep.equal(THREADS_COMPONENT);
    expect(fetchStub.firstCall.args[1].headers['user-agent']).to.include(
      'Discordbot',
    );
  });

  it('should return null when the fetch fails', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onFirstCall().resolves(new Response('', { status: 500 }));
    fetchStub.onSecondCall().rejects(new Error('network'));

    expect(await fetchThreadsComponent('https://fixthreads.seria.moe/x')).to.be
      .null;
    expect(await fetchThreadsComponent('https://fixthreads.seria.moe/x')).to.be
      .null;
  });
});
