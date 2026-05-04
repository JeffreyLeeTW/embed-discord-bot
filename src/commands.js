/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

export const INVITE_COMMAND = {
  name: 'invite',
  description: 'Get an invite link to add the bot to your server',
};

export const FIX_COMMAND = {
  name: 'fix',
  description: 'Fix social media links for Discord embeds.',
  options: [
    {
      type: 3,
      name: 'url',
      description: 'A Facebook, Instagram, X/Twitter, or Threads URL.',
      required: true,
    },
  ],
};

export const FIX_MESSAGE_COMMAND = {
  name: 'Fix embeds',
  type: 3,
};
