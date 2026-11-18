// 负责人：A
import { Navigate, Route, Routes } from 'react-router-dom'

import RequireAuth from './components/RequireAuth'
import Layout from './layout/Layout'
import Login from './pages/Login'
import Timeline from './pages/Timeline'
import People from './pages/People'
import PersonDetail from './pages/PersonDetail'
import MapPage from './pages/Map'
import Search from './pages/Search'
import Albums from './pages/Albums'
import AlbumDetail from './pages/AlbumDetail'
import Shared from './pages/Shared'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/s/:key" element={<Shared />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/timeline" replace />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<PersonDetail />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/albums" element={<Albums />} />
        <Route path="/albums/:id" element={<AlbumDetail />} />
        <Route path="*" element={<Navigate to="/timeline" replace />} />
      </Route>
    </Routes>
  )
}