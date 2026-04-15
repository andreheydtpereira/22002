V27 PROFISSIONAL LIMPA

Correção principal:
- cadastro agora cria no Firebase Auth
- o perfil do usuário só é gravado no Firestore após onAuthStateChanged confirmar a sessão
- isso evita o erro de permissão no primeiro cadastro

Configuração:
1. Authentication > Email/Password ativado
2. Firestore Database criado
3. Publicar firestore.rules
4. Subir os arquivos no GitHub Pages
