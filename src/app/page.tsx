export default function Home() {
  return <main>
    <h1>ALEteam: сервер электронного архива</h1>
    <p>Основа API. Пользовательский интерфейс разрабатывает Алинур.</p>
    <p>Тестовые материалы вымышлены и не являются документами государственного архива.</p>
    <ul>
      <li><a href="/api/health">Состояние сервера и БД</a></li>
      <li><a href="/api/documents">Каталог API</a></li>
      <li><a href="/api/funds">Фонды API</a></li>
    </ul>
  </main>;
}
