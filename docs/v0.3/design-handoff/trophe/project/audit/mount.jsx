/* global React, ReactDOM */

function DirectionalScreen({ BeforeComp, AfterComp, direction }) {
  const d = window.DIRECTIONS[direction] || window.DIRECTIONS.current;
  return (
    <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start', marginTop: 16, flexWrap: 'wrap' }}>
      <window.Phone tone="before" label="Current" direction={window.DIRECTIONS.current}>
        <BeforeComp/>
      </window.Phone>
      <div style={{ alignSelf: 'center', fontFamily: "'EB Garamond', serif", fontSize: 32, fontStyle: 'italic', color: '#7a2e1f', marginTop: 300 }}>→</div>
      <window.Phone tone="after" label={`Proposed · ${d.name}`} direction={d}>
        <AfterComp d={d}/>
      </window.Phone>
    </div>
  );
}

function useDir() {
  const [dir, setDir] = useState(() => localStorage.getItem('trophe-dir') || 'editorial');
  useEffect(() => {
    const sync = () => setDir(localStorage.getItem('trophe-dir') || 'editorial');
    window.addEventListener('trophe-dir-change', sync);
    return () => window.removeEventListener('trophe-dir-change', sync);
  }, []);
  return dir;
}

function DashboardMount() {
  const dir = useDir();
  return <DirectionalScreen BeforeComp={window.BeforeClientDashboard} AfterComp={window.AfterClientDashboard} direction={dir}/>;
}
function FoodlogMount() {
  const dir = useDir();
  return <DirectionalScreen BeforeComp={window.BeforeFoodLog} AfterComp={window.AfterFoodLog} direction={dir}/>;
}
function CoachMount() {
  const dir = useDir();
  return <DirectionalScreen BeforeComp={window.BeforeCoach} AfterComp={window.AfterCoach} direction={dir}/>;
}

// Toggle handler
document.querySelectorAll('.direction-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.dir;
    localStorage.setItem('trophe-dir', v);
    document.querySelectorAll('.direction-toggle button').forEach(b => b.classList.toggle('active', b.dataset.dir === v));
    window.dispatchEvent(new Event('trophe-dir-change'));
  });
});

const initDir = localStorage.getItem('trophe-dir') || 'editorial';
document.querySelectorAll('.direction-toggle button').forEach(b => b.classList.toggle('active', b.dataset.dir === initDir));

ReactDOM.createRoot(document.getElementById('root-dashboard')).render(<DashboardMount/>);
ReactDOM.createRoot(document.getElementById('root-foodlog')).render(<FoodlogMount/>);
ReactDOM.createRoot(document.getElementById('root-coach')).render(<CoachMount/>);
