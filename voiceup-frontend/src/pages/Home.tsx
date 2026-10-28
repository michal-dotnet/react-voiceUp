import { Link } from "react-router";

const Home=()=>{

    return <><h1>Welcomm to voiceup</h1>

    {/* Design content (text only, no server calls). */}
    <section className="vu-hero">
      <div>
        <span className="vu-live">דיווחים מהשכונה שלך</span>
        <h2>
          הקול שלך <span className="vu-highlight">משנה</span> את העיר.
        </h2>
        <p className="vu-hero-lead">
          מדווחים על מפגע, השכנים מאשרים "זה נוגע גם לי", ואנחנו עוקבים עד שזה מטופל – בשקיפות מלאה, צעד אחר צעד.
        </p>
        <div className="vu-cta">
          <Link className="vu-btn" to="/issues/new">📣 דווחו על מפגע</Link>
          <Link className="vu-btn" to="/IssuesPage">לכל הדיווחים</Link>
        </div>
      </div>

      <div className="vu-hero-art" aria-hidden="true">
        <span className="vu-blob a" />
        <span className="vu-blob b" />
        <span className="vu-bubble one">👍</span>
        <span className="vu-bubble two">📍</span>
        <span className="vu-bubble three">📣</span>
      </div>
    </section>

    <div className="vu-ticker" aria-hidden="true">
      <div className="vu-ticker-track">
        {[0, 1].map((copy) => (
          <span key={copy} style={{ display: "contents" }}>
            <span>● בורות בכביש</span>
            <span>● תאורה תקולה</span>
            <span>● ספסלים שבורים</span>
            <span>● פחים מלאים</span>
            <span>● מעברי חצייה דהויים</span>
            <span>● עצים שנפלו</span>
          </span>
        ))}
      </div>
    </div>

    <h2>איך זה עובד?</h2>
    <div className="vu-tiles">
      <div className="vu-tile sky">
        <span className="vu-emoji" aria-hidden="true">📝</span>
        <strong>1. מדווחים</strong>
        מתארים את המפגע, האזור והמיקום, ומצרפים עד 5 תמונות.
      </div>
      <div className="vu-tile sun">
        <span className="vu-emoji" aria-hidden="true" style={{ animationDelay: "0.3s" }}>🛡️</span>
        <strong>2. מנהל מאשר</strong>
        כל דיווח נבדק לפני שהוא מתפרסם.
      </div>
      <div className="vu-tile pink">
        <span className="vu-emoji" aria-hidden="true" style={{ animationDelay: "0.6s" }}>👍</span>
        <strong>3. השכנים מאשרים</strong>
        "זה נוגע גם לי" – גם בלי להתחבר.
      </div>
      <div className="vu-tile teal">
        <span className="vu-emoji" aria-hidden="true" style={{ animationDelay: "0.9s" }}>✅</span>
        <strong>4. עוקבים עד הטיפול</strong>
        פתוח ← בבדיקה ← הועבר לגורם מטפל ← בטיפול ← טופל.
      </div>
    </div>
    </>
}
export default Home
