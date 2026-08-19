# Changelog

## [0.1.0] - 2025-08-19

### Added

- Initial release: turn navigation drawer for DSH web conversations.
- Session-header trigger pill showing turn count (registered into `conversation.session.header.utilities`).
- Right-side overlay drawer listing every turn with index, user-message summary, and timestamp (registered into `shell.overlay`).
- Click-to-jump: scrolls the conversation flow to the turn's first node and briefly highlights it.
- Scroll-follow: the current turn is highlighted in the list as the user scrolls.
- Module-level relay bridge between the session-scope trigger and the root-scope drawer.
- Bilingual README (en/zh), CHANGELOG, CONTRIBUTING, LICENSE, release-check + post-publish-check scripts.
