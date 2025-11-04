---
pageId: 46956545
title: Launch game
spaceKey: S5
version: 49
lastUpdated: '712020:0aa84074-41f8-442b-b137-ac2d5bd53315'
pulledAt: '2025-11-04T10:17:44.814Z'
confluenceUrl: 'https://s5philippines.atlassian.net/pages/viewpage.action?pageId=46956545'
parentId: 46923777
connie-publish: true
connie-page-id: '46956545'
---

1. redirects
[https://www.s5dev.io/game-launcher/pg/symbols-of-egypt](https://www.s5dev.io/game-launcher/pg/symbols-of-egypt)
[https://www.s5dev.io/game-launcher/pg/symbols-of-egypt/symbols of egypt](https://www.s5dev.io/game-launcher/pg/symbols-of-egypt/symbols%20of%20egypt)
[https://www.s5dev.io/game-launcher-demo/pg/symbols-of-egypt](https://www.s5dev.io/game-launcher-demo/pg/symbols-of-egypt)
[https://www.s5dev.io/game-launcher-demo/pg/symbols-of-egypt/symbols of egypt](https://www.s5dev.io/game-launcher-demo/pg/symbols-of-egypt/symbols%20of%20egypt)
2. invalid game code
Go to [https://www.s5dev.io/game-launcher/pg/invalid-game-code](https://www.s5dev.io/game-launcher/pg/invalid-game-code)
Show 404 page

```adf 
{"type":"mediaSingle","attrs":{"layout":"wide","width":764,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1903,"id":"08cc56ba-0ee6-4156-94ee-c9dcc9ae7419","collection":"contentId-46956545","type":"file","height":1032}}]}
```
1. inactive game
Go to [https://backoffice.s5dev.io/games/99](https://backoffice.s5dev.io/games/99)
Update status to inactive
[https://www.s5dev.io/game-launcher/pg/symbols-of-egypt](https://www.s5dev.io/game-launcher/pg/symbols-of-egypt)
Guest: show login button
User: Show error message `Game not found or inactive`

```adf 
{"type":"mediaSingle","attrs":{"layout":"center","width":760,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1919,"id":"33083324-5f8c-41ba-b0d4-e15bfab356e9","collection":"contentId-46956545","type":"file","height":1012}}]}
```
1. game dont have trial mode
Go to [https://backoffice.s5dev.io/games/99](https://backoffice.s5dev.io/games/99)
turn of trial mode
Open [https://www.s5dev.io/game-launcher/pg/symbols-of-egypt?mode=trial](https://www.s5dev.io/game-launcher/pg/symbols-of-egypt?mode=trial)
Show error message `Game demo is not available`

```adf 
{"type":"mediaSingle","attrs":{"layout":"center","width":760,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1916,"id":"ce8109c5-b68e-4e2f-8f7b-44b259073a03","collection":"contentId-46956545","type":"file","height":1012}}]}
```
1. invalid game provider config
Go to [https://backoffice.s5dev.io/games/92](https://backoffice.s5dev.io/games/92)
Change Game Provider from PG To OneTouch
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)
Show 404 page
2. Inactive game provider
Go to PG provider config
[https://backoffice.s5dev.io/game-providers/2](https://backoffice.s5dev.io/game-providers/2)
Inactive status
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)
Show error message `Game Service class of pg not found: null`

```adf 
{"type":"mediaSingle","attrs":{"layout":"wide","width":770,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1919,"id":"fd2d33d5-d948-4849-beff-d5d1f19154bf","collection":"contentId-46956545","type":"file","height":1009}}]}
```
1. game provider maintenance
Go to PG provider config
[https://backoffice.s5dev.io/game-providers/2](https://backoffice.s5dev.io/game-providers/2)
Enable maintenance mode
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)
Show error message `Game provider is under maintenance.`

```adf 
{"type":"mediaSingle","attrs":{"layout":"center","width":746,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1918,"id":"e8a70f25-61bc-40d2-9174-be3d298d95a2","collection":"contentId-46956545","type":"file","height":1009}}]}
```
1. Disable all game
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)

Go to [https://backoffice.s5dev.io/system-settings](https://backoffice.s5dev.io/system-settings)
Search disable_all_gambling
Turn on Disable All Gambling

Navigate to home and show error message `The gambling was disabled by system.`

1. Uninitialized/Pending/Declined kyc
Go to [https://backoffice.s5dev.io/system-settings](https://backoffice.s5dev.io/system-settings)
Update require kyc for launch game
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)
Login terragonnew/123456
Show error messgage `Your KYC request need to be initialized.` and Submit now button with href /account/kyc
Login terragon2/123456
Show error messgage `Your KYC request is pending.`

```adf 
{"type":"mediaSingle","attrs":{"layout":"center","width":754,"widthType":"pixel"},"content":[{"type":"media","attrs":{"width":1919,"id":"7cbef825-4ae4-41bf-9cfc-79d72d5cad93","collection":"contentId-46956545","type":"file","height":998}}]}
```
1. Exclude/Kick User
Go to [https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi](https://www.s5dev.io/game-launcher/pg/legend-of-hou-yi)
Login terragon533/123456
Go to [https://backoffice.s5dev.io/players/6](https://backoffice.s5dev.io/players/6)

Exlude user

1. Waiting for system status api response excluded_account is true
2. api launch game error with response { error: "excluded_account", message: "Your account has been excluded." }
Navigate to home and show error message `Your account has been excluded.`

Kick user
api error with 401 status
Signout and Navigate to home, show error message `Your account has been kicked.`

1. Out of money popup
2. Sportbook BetConstruct (same as launch game)
3. RTG Tournament Page
Go to [https://www.s5dev.io/rtg-tournament](https://www.s5dev.io/rtg-tournament)
Click button with data-cta="tournament"
=> open game url in new tab/redirect
