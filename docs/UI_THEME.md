# TruckNav UI 테마

카카오내비에서 착안한 노란색 강조, 둥근 안내 카드, 밝고 어두운 지도/HUD를 구현했습니다. 공식 카카오 로고·이미지·상표 자산은 추가하지 않았습니다. 기존 게임 표지와 지도 스프라이트는 유지합니다.

## 사용 방법

게임 선택 화면 또는 **설정 → 화면 설정**에서 자동·주간·야간을 선택합니다.

- 기본값: 자동, 기기 현지 시각. 06:00 이상 18:00 미만은 주간입니다.
- 게임 내 시각 선택: 연결된 ETS2/ATS 텔레메트리 시각을 사용합니다. 연결이 끊기거나 시각을 읽을 수 없으면 기기 시각으로 전환합니다.
- 기기 시각은 30초 간격과 창 포커스/화면 복귀 시 갱신합니다.
- 지도 배경·도로·지명·영역과 HUD가 함께 전환됩니다. 지도 인스턴스와 경로는 유지합니다.
- 저장된 사용자 지도 색상을 사용하려면 해당 체크박스를 켭니다. 이 경우 배경·육지·도로는 게임별 저장 색상을 사용하고, 지명과 HUD는 화면 테마를 따릅니다.

기존 `truck-nav-settings` 키, 게임별 프로필, 단위, DLC, 모드, 목적지, IP, 언어 설정은 보존합니다. 새 필드는 `themeMode`, `themeClock`, `customMapColors`이며 오래된 설정에 기본값을 병합합니다. 신규 설치 언어는 한국어입니다. 화면 글자색은 화면 테마가 관리하며 기존 `textColor` 데이터는 보존합니다. 기존 프로필의 테마 색상은 트럭 마커에, 경로 색상은 경로에 계속 사용됩니다.

## 주요 구현

| 파일 | 역할 |
| --- | --- |
| `app/utils/theme.ts` | 시각 기반 테마 결정과 지도 팔레트 |
| `app/composables/NavigationTheme.ts` | 공통 테마 상태, 시계 수명 주기, 게임 시각 연동 |
| `app/utils/mapTheme.ts` | 기존 MapLibre 레이어 paint 갱신 |
| `app/assets/scss/global/_navigation-theme.scss` | 모든 화면의 토큰, HUD·설정·게임 선택 반응형 디자인 |
| `app/components/settings/themeControls.vue` | 공통 테마 선택 UI |
| `app/components/navigation/maneuverCard.vue` | 안내 카드와 한국어 방향 안내 표시 |

PMTiles 프로토콜, 게임 데이터 다운로드, 모드 관리, 경로 계산과 텔레메트리 처리 알고리즘은 유지합니다. 지도 패킹 스크립트는 전체 타입 검사를 위해 배열 경계를 명시하고 필수 CLI 인자 3개를 확인하도록 보완했습니다. 폰트는 기존 로컬 파일을 사용하며 빌드 중 외부 폰트 API를 호출하지 않습니다.

## 검증 재현

Node.js 22.18 이상 권장. 이 변경은 Node.js 24와 Chromium에서 검증했습니다.

```sh
npm ci
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:browser
```

시스템 Chromium이 있으면 `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`로 실행할 수 있습니다. 브라우저 테스트는 프로덕션 빌드를 3001 포트에서 실행합니다.

- 빌드: 성공.
- 타입 검사: 성공. 현재 Nuxt/Vue Router 조합에서 `vue-router/volar/sfc-route-blocks` 플러그인 export 경고가 출력되지만 TypeScript 오류와 종료 실패는 없습니다.
- 단위 테스트 4건: 06/18시 경계, 수동 우선, 게임 시각·연결 해제 대체, 기존 지도 레이어 색상 갱신.
- 브라우저 테스트 5건: 1280×900 / 390×844 / 844×390 화면, 시계 진행에 따른 자동 전환, 저장·재시작, 게임/모드 선택, 이전 설정 호환성, 실제 MapLibre+PMTiles 초기화, 텔레메트리 속도/제한속도와 게임 시각 연동, 설정 화면.
- 브라우저 스크린샷은 `test-results/`에 생성됩니다.

브라우저 테스트는 직접 생성한 빈 PMTiles, 빈 경로 그래프, 지도 설치 상태 API와 WebSocket 패킷을 사용합니다. 실제 ETS2/ATS 프로세스, Windows/Electron·Android/iOS 네이티브 실행, 대용량 지도 다운로드·압축 해제, 실제 도로망의 경로 안내 주행은 이 Linux 환경에서 검증하지 않았습니다. 실기기에서는 두 게임의 지도/모드 다운로드 후 경로 지정·주행·복귀와 네이티브 안전 영역을 추가로 확인해야 합니다.
