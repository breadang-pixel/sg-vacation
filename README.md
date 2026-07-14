# sg-vacation
26년 서광주 휴가계획

## Firebase Firestore 설정

GitHub Pages 앱은 Firebase Firestore의 `vacations` 컬렉션을 실시간으로 읽고 씁니다.
초기 테스트용 Firestore Rules는 아래처럼 설정하면 됩니다.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /vacations/{docId} {
      allow read, write: if true;
    }
  }
}
```

운영 시에는 회사 정책에 맞춰 쓰기 권한을 더 제한하는 것을 권장합니다.
