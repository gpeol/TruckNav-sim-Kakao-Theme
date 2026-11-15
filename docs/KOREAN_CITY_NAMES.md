# 한국어 도시명 표기

이 사전은 국립국어원 「외래어 표기 용례(지명)」 2018-12-14판에 근거합니다.
출처: https://m.korean.go.kr/front/etcData/etcDataView.do?etc_seq=368&mn_id=46
이용 조건: **공공누리 제1유형(출처표시)**. 이 파일과 app/data/koreanCityNames.json의 출처를 함께 보존하세요.

로컬 ETS2 기본 지도 374개 도시 중 정확 원어·국가·도시 정체성이 일치하는 140개와 별칭 근거가 있는 뮌헨 1개를 포함하여 총 141개(37.7%)를 수록합니다. 도시 token·원어(NFC)·국가가 모두 일치하고 한국어 및 ETS2 기본 지도일 때만 적용합니다. 중복 token/국가, 모드 지도, ATS, 다른 언어, 미확인 이름은 원문을 유지합니다. 회사와 마을 이름은 변환하지 않습니다. 좌표는 사전에 포함하지 않으며 외부로 전송하지 않습니다.

## Munich 연결 근거
게임 자료의 munchen / Munich / germany와 국립국어원 München / 뮌헨 항목을 연결합니다. 뮌헨 시 공식 영문 문서의 City of Munich (Landeshauptstadt München) 표기가 동일 도시임을 명시합니다.
https://stadt.muenchen.de/dam/jcr:1587dc3e-ab72-44f9-b736-ad53fa4ee2e9/Englisch_SKA_Rahmenwerk_WEB_Final.pdf

## 한계
2018판의 설명에는 오래된 행정구역 정보가 포함될 수 있습니다. 완전한 세계 지명 사전이나 음역 엔진이 아니며, 미확인 별칭을 추정하지 않습니다. 게임 지도 및 모드 자료가 변경되면 원문으로 돌아가는 것이 의도된 동작입니다.

## 국가 표기
설치 지도 35개 countryToken 중 공식 자료에서 국가 정체성이 확인된 24개만 국명을 수록합니다. 검증된 도시를 한국어로 표시할 때만 국명도 한국어로 바꾸며, 도시 미확인·모드·ATS·다른 언어에서는 원문 국가 문자열을 유지합니다. Luxembourg의 벨기에 주 표제, Kosovo의 옛 자치주 설명 등 국가로 확정할 수 없는 항목은 제외합니다. Vaasa는 원문이 주 항목이므로 도시 사전에서 제외했습니다.

독일 표기는 국립국어원 온라인가나다 2026-02-05 답변의 Deutschland 한국어 국명 설명에 근거합니다. Germany와 Deutschland 연결은 독일 외무부 공식 국명 번역표(Deutsch Bundesrepublik Deutschland / Englisch Federal Republic of Germany)를 근거로 별도 기재했습니다. 이 국명 보완 근거는 2018 지명자료와 별도 출처이며, 해당 문서 전체를 공공누리 제1유형 자료로 주장하지 않습니다. 링크는 JSON의 각 국가 레코드에 있습니다.

튀르키예 국명은 같은 2026-02-05 국립국어원 답변의 공식 명칭 변경 설명으로 보완했습니다. 2018판 Turkey→터키는 현행 국명으로 채택하지 않았습니다.
