# Tailscale 미리보기

이 미리보기는 Tailscale에 로그인한 PC 소유자 계정에서만 접속할 수 있습니다. 앱 화면과 지도 파일은 읽기 전용으로 제공되며, 지도 설치 및 삭제 요청은 차단됩니다. 게임 정보와 경로 정보도 읽기 전용으로 전달됩니다.

이 구성은 실행 중인 TruckNav 데스크톱 앱의 지도 서버와 텔레메트리 서버를 사용합니다. `3101`과 `3102`는 PC 내부의 `127.0.0.1`에서만 수신하며, Tailscale Serve가 `3001`에서 HTTPS 연결을 받습니다. 게임을 읽는 기능은 현재 검증된 ETS2 1.62.1 실행 파일에서만 활성화됩니다. 실행 파일이 달라지면 게임 경로를 표시하지 않습니다.

## 다시 시작하기

PC와 접속할 기기를 같은 Tailscale 계정에 연결하고 TruckNav 데스크톱 앱을 실행합니다. 프로젝트 루트에서 `npm run build`로 화면을 빌드한 뒤, PowerShell 창 두 개에서 각각 다음 명령을 실행합니다.

첫 번째 창:

```powershell
$env:NITRO_PORT = '3101'
$env:NITRO_HOST = '127.0.0.1'
$env:TRUCKNAV_PREVIEW_NO_TELEMETRY = '1'
node .output/server/index.mjs
```

두 번째 창:

```powershell
$tsStatus = tailscale status --json | ConvertFrom-Json
$tsUser = $tsStatus.User.PSObject.Properties[[string]$tsStatus.Self.UserID].Value
if ($tsStatus.BackendState -ne 'Running' -or -not $tsUser.LoginName -or -not $tsStatus.Self.DNSName) { throw 'Tailscale 연결 상태를 확인하세요.' }
$env:TRUCKNAV_PREVIEW_OWNER = $tsUser.LoginName
$env:TRUCKNAV_PREVIEW_HOST = $tsStatus.Self.DNSName.TrimEnd('.')
$env:TRUCKNAV_PREVIEW_HTTPS_PORT = '3001'
$env:TRUCKNAV_PREVIEW_GAME_ROUTE = '1'
$env:TRUCKNAV_PREVIEW_TRAFFIC = '1'
$env:TRUCKNAV_PREVIEW_TMP_NEARBY = '1'
node scripts/secure-preview-gateway.mjs
```

`tailscale serve status`에서 HTTPS 포트 `3001`이 `http://127.0.0.1:3102`를 가리키는지 확인합니다. 설정이 없을 때만 다음 명령으로 추가합니다. 다른 서비스가 이미 `3001`을 사용한다면 덮어쓰지 말고 기존 설정을 먼저 확인합니다.

```powershell
tailscale serve --bg --https=3001 http://127.0.0.1:3102
```

표시되는 `https://<기기 이름>.ts.net:3001/` 주소로 접속합니다. 두 PowerShell 창을 닫으면 로컬 서버가 종료됩니다. Tailscale Serve 설정은 백그라운드에 남을 수 있으며, 해당 포트의 공유만 중지하려면 `tailscale serve --https=3001 off`를 실행합니다.

## 경로 기능의 범위

게임에 설정한 목적지와 검증된 경유지를 읽어서 TruckNav 경로 계산에 사용합니다. 도로 경로는 TruckNav가 별도로 계산하므로 게임 화면의 경로와 다를 수 있습니다. TruckNav에서 지정한 목적지를 게임으로 보내는 기능은 아직 구현되지 않았습니다.

같은 읽기 전용 기능은 다시 빌드한 Windows 설치형 앱에서도 사용할 수 있습니다. ETS2 텔레메트리가 연결된 동안에만 경로 읽기 도우미를 실행하며, 연결이 끊기거나 안내 화면을 닫으면 종료합니다. 지원하지 않는 게임 버전이나 다른 운영체제에서는 게임 경로를 읽지 않습니다.

## TruckersMP 교통량 추정

위 환경 변수를 설정하면 화면 설정에서 ETS2 서버를 선택할 수 있습니다. 서버를 선택하기 전에는 교통 데이터를 조회하지 않습니다. 고정된 게임 지도 전체의 공개 차량 좌표를 가져와 사용자의 경로와 로컬에서 비교하므로 사용자 위치와 경로는 외부에 보내지 않습니다. 차량 이름은 처리하지 않고 식별자는 게이트웨이 실행 중에만 유지되는 임의 키로 익명화합니다.

30초 이상 간격으로 관측한 차량 여러 대가 거의 이동하지 않는 구간을 추정하므로, 실제 정체와 다르거나 주차 차량 또는 가까운 다른 도로가 포함될 수 있습니다. 정보가 없거나 오래된 구간은 표시하지 않습니다. 기본 ETS2 지도에서 사용할 수 있으며, 설치형 Electron 앱에서는 앱 내부 통신으로 같은 기능을 제공합니다. 설치형 앱에서 변경 사항을 사용하려면 앱을 다시 빌드해야 합니다.

차량 마커는 게임에 설치한 TruckNav의 TruckersMP SDK 플러그인이 실제로 로딩한 주변 차량만 표시합니다. 사용자 이름이나 계정 ID는 전달하지 않으며, 게임 연결이 끊기거나 데이터가 오래되면 마커가 사라집니다. 플러그인 빌드와 설치 위치는 `plugins/tmp-nearby/README.md`를 참고하세요. SDK 플러그인이 없으면 마커가 표시되지 않지만 외부 데이터를 사용한 교통량 추정은 별도로 동작합니다.
