# Digit Lens — 손글씨 숫자 인식

캔버스에 마우스 또는 터치로 숫자를 그리면, TensorFlow.js와 실제 학습된 MNIST 모델이 0~9 중 숫자를 예측하고 각 숫자의 확률을 보여주는 정적 웹서비스입니다. 규칙 기반이나 무작위 예측을 사용하지 않으며, 모델을 불러오지 못하면 오류를 표시합니다.

## 프로젝트 구성

- `index.html`: 화면과 TensorFlow.js CDN 로드
- `styles.css`: 반응형 사용자 화면
- `app.js`: 캔버스 입력, 28×28 전처리, 모델 추론, 확률 표시
- `package.json`: Node.js 실행 환경과 구문 검사 명령
- `.github/workflows/deploy.yml`: `main` push 시 GitHub Pages 자동 배포
- `.nojekyll`: GitHub Pages 정적 파일 처리 설정
- `requirements.txt`: Python 의존성 없음 안내 파일

## 설치 방법

1. Windows에 Node.js 18 이상을 설치합니다.
2. 이 폴더를 다운로드하거나 GitHub 저장소에서 clone합니다.
3. 별도 Python 패키지는 설치하지 않습니다. 이 프로젝트는 Node.js 정적 웹서비스입니다.

```powershell
cd "upload 폴더의 전체 경로"
npm.cmd install
```

`package.json`에 외부 npm 의존성이 없으므로 `npm install`은 선택 사항입니다.

## 모델 준비 방법

모델 파일을 저장소에 복사하지 않습니다. `app.js`가 다음 공개 TensorFlow.js 모델 주소를 실행 시 불러옵니다.

`https://storage.googleapis.com/learnjs-data/model_zoo/mnist/model.json`

이 모델은 MNIST 손글씨 숫자 데이터셋으로 학습된 모델입니다. 모델을 불러오려면 실행 환경에서 인터넷 연결이 필요합니다. 모델 로드에 실패하면 화면 상단 상태가 실패로 바뀌고 오류 메시지가 표시됩니다.

## 실행 방법

정적 서버로 실행해야 브라우저의 모델 로드와 모듈 동작을 안정적으로 확인할 수 있습니다.

```powershell
npx.cmd --yes serve . -l 8080
```

브라우저에서 `http://localhost:8080`을 열고 다음 순서로 확인합니다.

1. 상단 상태가 `모델 준비 완료`인지 확인합니다.
2. 캔버스에 숫자 하나를 크게 그립니다.
3. `숫자 인식`을 눌러 예측 숫자와 0~9 확률을 확인합니다.
4. `지우기`로 입력을 초기화합니다.

기본 구문 검사는 다음과 같습니다.

```powershell
node --check app.js
```

## GitHub 업로드와 자동 배포

GitHub에서 빈 저장소를 만든 뒤, 이 `upload` 폴더 안에서 실행합니다. 아래 URL은 자신의 저장소 주소로 바꿉니다.

```powershell
git init
git add .
git commit -m "Add handwritten digit recognition service"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

GitHub 저장소의 `Settings → Pages`에서 배포 Source를 `GitHub Actions`로 선택합니다. 이후 `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 구문 검증 후 GitHub Pages에 자동 배포합니다. 실제 GitHub 업로드와 배포에는 사용자의 GitHub 인증이 필요하며, 인증정보는 코드에 저장하지 않습니다.

