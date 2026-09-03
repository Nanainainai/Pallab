import {
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';

import { useState, useEffect } from 'react';

import Cursor from './components/cursor';
import Menu from './components/menu';
import Access from './components/access';
import Create from './components/create';
import Letter from './components/letter-report';
import Report from './components/report';
import AmelaViewAndEdit from './components/amela';
import JamaatEditor from './components/jamaat-editor';
import TemplateMaker from './components/template-maker';
import CosmeticsEditor from './components/cosmetics-editor';
import LetterDatabase from './components/letter-database';
import ReportDatabase from './components/report-database';
import NotificationEditor from './components/notification-editor';

const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();

  return now.getMonth() >= 10
    ? [
      `${year}`,
      `${(year + 1) % 100}`,
    ]
    : [
      `${year - 1}`,
      `${year % 100}`,
    ];
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] =
    useState(() => {
      return (
        localStorage.getItem(
          "isAuthenticated"
        ) === "true"
      );
    });

  const navigate = useNavigate();

  useEffect(() => {
    const status =
      localStorage.getItem(
        "isAuthenticated"
      );

    if (status === "true") {
      setIsLoggedIn(true);
    }
  }, []);

  const handleSuccessfulLogin = () => {
    setIsLoggedIn(true);

    localStorage.setItem(
      "isAuthenticated",
      "true"
    );

    navigate("/");
  };

  const [formValues, setFormValues] =
    useState(() => {
      const saved =
        localStorage.getItem(
          "letterFormValues"
        );

      const parsed = saved
        ? JSON.parse(saved)
        : {};

      if (!parsed["fy-start"]) {
        parsed["fy-start"] =
          getFinancialYear()[0];
      }

      if (!parsed["fy-end"]) {
        parsed["fy-end"] =
          getFinancialYear()[1];
      }

      if (!parsed["date"]) {
        parsed["date"] =
          new Date()
            .toLocaleDateString(
              "en-GB"
            )
            .replace(/\//g, ".");
      }

      return parsed;
    });

  const handleInput = (event) => {
    setFormValues((previous) => ({
      ...previous,
      [event.target.name]:
        event.target.value,
    }));
  };

  useEffect(() => {
    localStorage.setItem(
      "letterFormValues",
      JSON.stringify(formValues)
    );
  }, [formValues]);

  return (
    <div className="flex justify-center w-full h-screen">
      <Cursor />

      {isLoggedIn && <Menu />}

      <Routes>
        <Route
          path="/access"
          element={
            <Access
              onLogin={
                handleSuccessfulLogin
              }
            />
          }
        />

        <Route
          path="/"
          element={
            isLoggedIn ? (
              <Create />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/letter"
          element={
            isLoggedIn ? (
              <Letter
                formValues={
                  formValues
                }
                setFormValues={
                  setFormValues
                }
                handleInput={
                  handleInput
                }
              />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/report"
          element={
            isLoggedIn ? (
              <Report />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/amela"
          element={
            isLoggedIn ? (
              <AmelaViewAndEdit />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/jamaat"
          element={
            isLoggedIn ? (
              <JamaatEditor />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/template"
          element={
            isLoggedIn ? (
              <TemplateMaker />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/cosmetics"
          element={
            isLoggedIn ? (
              <CosmeticsEditor />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/database/letter"
          element={
            isLoggedIn ? (
              <LetterDatabase />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/database/report"
          element={
            isLoggedIn ? (
              <ReportDatabase />
            ) : (
              <Navigate to="/access" />
            )
          }
        />

        <Route
          path="/notification-editor"
          element={
            isLoggedIn ? (
              <NotificationEditor />
            ) : (
              <Navigate to="/access" />
            )
          }
        />
      </Routes>
    </div>
  );
}